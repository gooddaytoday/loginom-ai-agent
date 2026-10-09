# Исходные несоответствия атрибуции runtime

Проверено 2026-10-06 при выполнении package-docs. Исходный продуктовый SHA:
`fc3d97dbf695c2ed8dba942feb6fe83591a33944`; импорт Dock в source-map:
`83c52ebb653e6bd7df294d4e24fc5545cb955b14`.

35 активных импортированных файлов уже отличаются от записанного источника,
но их текущие байты совпадают с продуктовым baseline. Это не изменения данного
направления. Исходные object/ref/SHA в source-map сохранены; хэши этих файлов
в source-transforms не пересчитаны. Общий verify_sources.py пока завершается
IMPORTED_HASH_MISMATCH. Проверки действительно изменённых файлов выполняются
отдельно и не означают успешного общего аудита.

Перед живой приёмкой требуется разобрать историю этих преобразований и записать
проверяемую атрибуцию отдельно. Этот документ не является исключением verifier
или разрешением пропустить gate. Полный список сохранён также в собственном
каталоге приёмки, source-attribution-open-mismatches.json.

| Файл | SHA источника Dock | SHA baseline и текущего файла |
| --- | --- | --- |
| `packages/loginom-runtime/client/lib/browser-geometry.mjs` | `6083c3622feaba5aabddaeaf700d50eed6d9bd012479dbf6c94be9e18bd8a843` | `0b7027db8db0e164659de33423ea122d791a9eabbcbf9691eac2c5eeba7df89f` |
| `packages/loginom-runtime/client/lib/calculator-node.mjs` | `bc0606ee6d2b969e776aed56036e75418a2230db4ac1b100b1fadb00d8415577` | `3f4dfcc7342463e768cc93dd0defda59f892989c23e3e4f305f8d60fc857dc51` |
| `packages/loginom-runtime/client/lib/collapse-native-output.mjs` | `68f0d0d7b5a1fbde4b01f7e633df90847895bbb1c553b0143c15191ab76c5cbe` | `6806ca195f965a36016bc560001f279f8f37c53b31f95247091c0ae740294e1b` |
| `packages/loginom-runtime/client/lib/collapse-native-source.mjs` | `e7ee7d7d1324f058957ee9fb5e1038837479b13b9902108cff6e5c6a84d1d130` | `0307cc804ccb36902bbce7b8dcf5accdc113f627a20a12dd5e7fba2b3287a3af` |
| `packages/loginom-runtime/client/lib/executor.mjs` | `df21720858bb89bb40d6c4fe46620728b1d6e86b0d9d7aafa4992c8f2cf93a6e` | `af6640089ba28982439ab2712ffbfccb7ea863bdef57ae18aa28d1caf37239e7` |
| `packages/loginom-runtime/client/lib/node-api.mjs` | `e7b2e721bc5a1c9d2a3c575e05b7776558e6b18970f769b688a3d34a82a29fc4` | `8c4dd6180e40a520c17d29e624fe43b04faf1b75ecd60bcc8931fe014daf7037` |
| `packages/loginom-runtime/client/lib/node-apply.mjs` | `d9f4f12730a3195e893cd04244fa7d53cf7c16604e49cae3334a013903c1dcb3` | `f12976409b338cab1a4b931d98f0f63176454bb27c9e390e4ed4dd58e2576bdf` |
| `packages/loginom-runtime/client/lib/node-contracts.d.ts` | `6010d1dfda79b52b3bfd3ab2789360843fbdd8a4fc10b7d47179f327cd54cc8c` | `8152bb40ded32c2e6551f32fece5cf6458a19bb4922d2f51bb8da32cee5de2b7` |
| `packages/loginom-runtime/client/lib/node-contracts.mjs` | `8cd9f420678106657e06e0a01032d4b4515c216a0cfe65e57d855aa1a0d2bcc3` | `a6ae7feae437e20816dccb5d4aba35c5d9f8dde6418b2c45e60a9e58879102fe` |
| `packages/loginom-runtime/client/lib/node-mapping-context.mjs` | `c5577f0085dca6ca2fc3cbe7010832e1ec628debddfdf150ff715c205f159a46` | `3f60565803cbdb037289f466083523bfa4766400df83de3ecde1edd54fc0c5ee` |
| `packages/loginom-runtime/client/lib/node-placement.mjs` | `fb06a39bda12142d6d9b428e8f01cce54e40a6b7c7a05e4e79f6e7333c578370` | `8b7d79124ea98cf733c52bf94923162ce351a42571242f2a11860a7b9d0c9150` |
| `packages/loginom-runtime/client/lib/node-port-open.mjs` | `d1ce993e307033c186a698d62750a7af0d171ad1495e2c85d538d78fffde0f0c` | `27d1a4b116ee5918f608bef3db625a6835305575b8e19ce1b6c1fadbe348562c` |
| `packages/loginom-runtime/client/lib/node-procedure.mjs` | `eb08dda1ea023c1df95bac5efd4c6bccf314bea277f2d4bafd9396bec4ee94ff` | `27d44f5691ea8f7f09cf844e5c9a6c868c33501f17268d75fc0174ee5dafb24d` |
| `packages/loginom-runtime/client/lib/node-read-contract.mjs` | `48381128aa5b19e0246f7653612c550a9e3c54e3bae41a811eb64c8552ac7ef4` | `898ad78d2a4c7b8695ea551a34beed4074896834fe2f6a45bf130827ea5fdea2` |
| `packages/loginom-runtime/client/lib/node-read-driver.mjs` | `3275e61017813cec3fdba6c083a3edcc8049c25cba6e7ae02b9644d42bb425f5` | `5c328111230b252cd30f649ff9e404cebe4fca48e6676648db1b84887441c77b` |
| `packages/loginom-runtime/client/lib/node-result-schema.mjs` | `534b71c4605fcdac44ce1dced6e1b2d25e05a68ccdab0e8c686beb002018c9d9` | `8bf93a762b7137769bc195441f1dc3224333921aef5d29bebe597eeddb32a791` |
| `packages/loginom-runtime/client/lib/node-support.mjs` | `ad4e46a95b88681128bd25b6628b78ebe2014a8f1be1ba576d9b3077e3757352` | `3ec2a882b897f24208af37eaedc7376db1f2ff7b9b24ca9cf0810b01fafab9a9` |
| `packages/loginom-runtime/client/lib/node-table-context.mjs` | `e6abb2f5d632d6deadb109e413bb3b7a4f3c7c8a5a543fe3504929a28e5274cc` | `b6d0892acf03fed3c01a4ef4143278b269a1cff0d33718aa8f85a1b5c8c14867` |
| `packages/loginom-runtime/client/lib/node-target-browser.mjs` | `aebab1ef9bc8b6df4c13b5d06b8d28980b7affe07d7badf5a39b070503ded39a` | `e4505bb31711f5ba5e0b22a4bd42f66c8fdd6b9fd1ae9ce7c6b21bb4f807dc15` |
| `packages/loginom-runtime/client/lib/observation-pages.mjs` | `162e74afe5509b63eec3017f1d45dc23c941533bbd7fe53786f80aa2b16a4c0a` | `0fea109e7a91ec9f69762dba0ed443aa59b5a4610f7c41fed72dd7579845fc76` |
| `packages/loginom-runtime/client/lib/session.mjs` | `db89431390466874ef7ea709f5e8c866d1558dd54fc776c9ea1befd3bf286ef3` | `fb6fa775f18a10b1e5c3cf160c69ba04188f81100614cda9dcf9fda4e48e563d` |
| `packages/loginom-runtime/client/lib/variant-native-read.mjs` | `baa09af7f840315c4cff1848804085eef47d4ff57381a8d08fd9a7047ec9d06c` | `118ccc0c12bfa83cf1ab8764bc553c4a6994c30c9f79e0b80bcebc35c80acb7d` |
| `packages/loginom-runtime/client/lib/workspace-ui.mjs` | `cd5898556ca838c2a00e9b5a5a717c614de72f7962c034d95fcdc26b832a7624` | `099edc2e9a3423ae16706ae537bd77c67983255a3594e8ff08bc46ab32b98af3` |
| `packages/loginom-runtime/client/test/acceptance-observation.test.mjs` | `3ca75b3855280b759be4d5064c5d3c49bc4547af80b1a7c77132b96c55bc2f48` | `2a48dc7d0aa614458057d8998d735fff764d9c9dfee8656477c8490aa7ad7ff4` |
| `packages/loginom-runtime/client/test/collapse-native-source.test.mjs` | `d2187f441ffdbfbc5a15f1599d624943b4c6b0363c326c2a6b4c3234c1dc51c5` | `202c8abd5a79e68808774cfd4ac8159994858a28df3b583ade76b7c00349b5ed` |
| `packages/loginom-runtime/client/test/node-apply-runtime.test.mjs` | `1182580cc60adeb720d6fbfa002e56699254765d18ae8dbf96f34c1e7cb59fbd` | `332e0a42b749ce61e7fd7b64244ac08269df3fd571362a782c0dcb85885c213c` |
| `packages/loginom-runtime/client/test/node-apply.test.mjs` | `09e457cc476dc16b0790fad7d1742737cdbc59563a27594624b25056781bd00c` | `6287b6641cdd8dff4a6b58f02fc256505bf97c957d35f0a0cccbfd855eec4e88` |
| `packages/loginom-runtime/client/test/node-mapping-context.test.mjs` | `e5344ba08666250d63a5e5cc7c214bfffda84a3e5309d7cc3f18471c56800fb6` | `8b7f6f63ee83c30dd5480668010d54dcb68dd51b91ff42cb3c1ca08a23c70db6` |
| `packages/loginom-runtime/client/test/node-placement.test.mjs` | `4ce1a2ec34ce3c5b68dcacc15d05cc438e70ec7cddcc7ff3b76f7edc1038b278` | `485ce08f855bca1cb3cf74af38a368374918a1ddb92213f54cf63557a10354cc` |
| `packages/loginom-runtime/client/test/node-port-open.test.mjs` | `f6fdc3c9b85f40a60b7b27c165ab4bcaaac047719751e97e2ad6dfef637993f0` | `b7110e0ad049156759bb467715e5c7b40de9fe2894a01d7b005196792994995b` |
| `packages/loginom-runtime/client/test/node-procedure.test.mjs` | `91f5b67c0bd4c21a12d143eb78c6a5700812d40b3d5d5403cd0164731e9b514f` | `9a5c594b41660676475c932b512814c0237291fc403808f2a5f28c460fdbc9c2` |
| `packages/loginom-runtime/client/test/node-table-context.test.mjs` | `e86e686962632c8e04797ba5f5a61ec8812979f755417737c6152b47f8ddf870` | `3dfb58b03a21be2059ee6b52c8fc68b7e9df935ac298d54e2e06469f65260164` |
| `packages/loginom-runtime/client/test/variant-native-read.test.mjs` | `6957a3e1c397b86acbbf6527acee431e5467bb0cb71b55c36d16f6337fdef7ab` | `cc0cc7f8323342010ef0ee8b61f0e0c2afb778507d4067ecf1ccef9ea944514d` |
| `packages/loginom-runtime/client/test/workspace-ui.test.mjs` | `2c3fa72c098e439a19b4a309e4acb244d34816aa6891926f3e9ae897cfad5a49` | `8d27ee27f7a4a370adda023bf8d594968ca431399774397f3d23e04e1a6750b0` |
| `packages/loginom-runtime/tools/loginom-acceptance/rename_effect.py` | `9280899083ee0f86867d1b2fa5f5ed392adb99ee079d84466990da7cbd7b3ded` | `6e53e311bfe0f881e5e699e220f06d65e1242dfd12b019fffeb4fc12d9ed32bb` |
