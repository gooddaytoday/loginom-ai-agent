# Measured connection binding — Loginom7.4.2

2026-10-14: on the LAB71 worker account, before opening a package, actual native FInstance.FMap was absent. FMainForm.FMapTree and its FServerConnection were own value properties. UserName/Session/Connected were prototype getters with these defining bodies:

```js
function () { return this.FUsername; }
function () { return this.FSession; }
function () { return !!this.FConnected; }
```

FUsername/FSession/FConnected were own cached value fields (string/object/boolean). The original opening reader now uses this canonical MapTree, never invokes a getter, and requires those exact native getter definitions plus inert own cached fields. Earlier own-data layout remains supported; it cannot replace a present canonical map. Retained connection descriptors, map location, instance/main/workspace and cached session/account/connected state are rechecked after final provider reads. Unknown/accessor cache fields, substituted getters/maps/instances and drift refuse; no generic getter or schema fallback.

Fresh Dispatcher inventory: worker/reviewer sessions zero before measurement. Each independent operator/worker read-only session had native logout and browser close confirmed; no package/import/model/configure/save was opened or run. This measures connection ABI compatibility, not original prepared graph/wizard/output0/schema/current native clean/freshness/Close authority. ModelForm was not loaded in the blank worker page; that observation is not a claim about its later prepared model namespace.

Production original procedure→typed slot/read/record tests include the measured-layout control and exact negative substitutions on explicit Page/native doubles. Every fixed result still carries PARTIAL/REFUSED and native/configure/Close authority=false, opening effect=true. Ordinary positive Import/mapping/model/cold/full Join remain separate next measurements. Safety policy and historical UNKNOWN remain unchanged.
