#import <Foundation/Foundation.h>
#import <Security/Security.h>
#include <stdio.h>

// Private stdin contains only operation + profile hash. stdout contains key bytes
// as base64. Never print Security diagnostics or credential material to stderr.
int main(void) {
  @autoreleasepool {
    char input[80];
    size_t length = fread(input, 1, sizeof(input), stdin);
    if (ferror(stdin) || !feof(stdin) || length >= sizeof(input)) return 1;
    NSString *request = [[NSString alloc] initWithBytes:input length:length encoding:NSUTF8StringEncoding];
    BOOL create = [request hasPrefix:@"create "];
    if (!create && ![request hasPrefix:@"read "]) return 1;
    NSString *account = [request substringFromIndex:create ? 7 : 5];
    NSCharacterSet *invalid = [[NSCharacterSet characterSetWithCharactersInString:@"0123456789abcdef"] invertedSet];
    if (account.length != 64 || [account rangeOfCharacterFromSet:invalid].location != NSNotFound) return 1;
    if (SecKeychainSetUserInteractionAllowed(false) != errSecSuccess) return 1;
    NSDictionary *identity = @{
      (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
      (__bridge id)kSecAttrService: @"com.loginom.aiagent.cli.profile-key.v1",
      (__bridge id)kSecAttrAccount: account,
    };
    NSMutableDictionary *query = [identity mutableCopy];
    query[(__bridge id)kSecReturnData] = @YES;
    query[(__bridge id)kSecMatchLimit] = (__bridge id)kSecMatchLimitOne;
    CFTypeRef found = NULL;
    OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)query, &found);
    if (status == errSecItemNotFound && create) {
      unsigned char bytes[32];
      if (SecRandomCopyBytes(kSecRandomDefault, sizeof(bytes), bytes) != errSecSuccess) return 1;
      NSMutableDictionary *item = [identity mutableCopy];
      item[(__bridge id)kSecValueData] = [NSData dataWithBytes:bytes length:sizeof(bytes)];
      status = SecItemAdd((__bridge CFDictionaryRef)item, NULL);
      if (status != errSecSuccess && status != errSecDuplicateItem) return 1;
      status = SecItemCopyMatching((__bridge CFDictionaryRef)query, &found);
    }
    if (status != errSecSuccess || found == NULL) return 1;
    id value = CFBridgingRelease(found);
    if (![value isKindOfClass:[NSData class]] || [value length] != 32) return 1;
    const char *output = [[value base64EncodedStringWithOptions:0] UTF8String];
    if (fputs(output, stdout) == EOF || fflush(stdout) != 0) return 1;
    return 0;
  }
}
