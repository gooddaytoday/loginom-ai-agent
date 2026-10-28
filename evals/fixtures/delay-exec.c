#define _GNU_SOURCE
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <time.h>
#include <unistd.h>

int execve(const char *file, char *const argv[], char *const envp[]) {
  const char *target = getenv("EVAL_EXEC_DELAY_TARGET");
  const char *receipt = getenv("EVAL_EXEC_DELAY_RECEIPT");
  if (!target || !receipt || strcmp(file, target)) return syscall(SYS_execve, file, argv, envp);
  struct stat executable;
  char buffer[256];
  if (stat("/proc/self/exe", &executable)) _exit(125);
  int length = snprintf(buffer, sizeof(buffer), "{\"pid\":%d,\"parent\":%d,\"device\":%lu,\"inode\":%lu}\n",
    getpid(), getppid(), (unsigned long)executable.st_dev, (unsigned long)executable.st_ino);
  int fd = open(receipt, O_WRONLY | O_CREAT | O_EXCL, 0600);
  if (fd < 0 || write(fd, buffer, length) != length) _exit(125);
  close(fd);
  struct timespec delay = { .tv_sec = 1 };
  syscall(SYS_nanosleep, &delay, NULL);
  size_t count = 0, kept = 0;
  while (envp[count]) count++;
  char *clean[count + 1];
  for (size_t i = 0; i < count; i++)
    if (strncmp(envp[i], "LD_PRELOAD=", 11) && strncmp(envp[i], "EVAL_EXEC_DELAY_", 16)) clean[kept++] = envp[i];
  clean[kept] = NULL;
  return syscall(SYS_execve, file, argv, clean);
}
