var rpc;
(function (rpc) {
    var $imp;
    (function ($imp) {
        function prepareSelectCastProps(type, arg1, arg2) {
            var safeCast, selector;
            if (typeof arg1 === "boolean") {
                safeCast = arg1;
                selector = arg2;
            }
            else {
                selector = arg1;
            }
            return rpc.TBGSession.SelectIntfCastPropertyDesc(type, selector, safeCast);
        }
        function prepareSelectProps(source, arg1, arg2, arg3) {
            var type, safeCast, selector;
            if (typeof arg2 === "boolean") {
                type = arg1;
                safeCast = arg2;
                selector = arg3;
            }
            else if (arg2) {
                type = arg1;
                selector = arg2;
            }
            else {
                selector = arg1;
            }
            return rpc.TBGSession.SelectInterfacePropertyDesc(source, selector, type, safeCast);
        }
        function prepareSelectItems(arg0, arg1, arg2, arg3, arg4) {
            var source, items, count, selector, type, safeCast;
            if (typeof arg1 !== "function") {
                items = arg0;
                count = arg1;
                selector = arg2;
                type = arg3;
                safeCast = arg4;
            }
            else {
                source = arg0;
                selector = arg1;
                type = arg2;
                safeCast = arg3;
                if (source instanceof rtl.SelectorMemberInfo) {
                    return select(source, function (source) { return [selectAll(source, selector)]; });
                }
                items = source.Items;
                count = source.Count;
                Debug.assert(items && count);
            }
            return rpc.TBGSession.SelectItemsPropertyDesc(items, count, selector, type, safeCast);
        }
        function prepareSelectItemRange(arg0, rangeStartIndex, rangeEndIndex, arg3, arg4, arg5, arg6) {
            var source, items, count, selector, type, safeCast;
            if (typeof arg3 !== "function") {
                items = arg0;
                count = arg3;
                selector = arg4;
                type = arg5;
                safeCast = arg6;
            }
            else {
                source = arg0;
                selector = arg3;
                type = arg4;
                safeCast = arg5;
                if (source instanceof rtl.SelectorMemberInfo) {
                    return select(source, function (source) { return [selectRange(source, rangeStartIndex, rangeEndIndex, selector)]; });
                }
                items = source.Items;
                count = source.Count;
                Debug.assert(items && count);
            }
            return rpc.TBGSession.SelectItemRangePropertyDesc(items, count, rangeStartIndex, rangeEndIndex, selector, type, safeCast);
        }
        function prepareSelectSimpleItems(arg0, arg1, arg2) {
            var source, items, count, simpleItemType;
            if (typeof arg1 !== "undefined" && typeof arg1 !== "boolean") {
                items = arg0;
                count = arg1;
                simpleItemType = arg2;
            }
            else {
                source = arg0;
                simpleItemType = arg1;
                items = source.Items;
                count = source.Count;
                Debug.assert(items && count);
            }
            var result = rpc.TBGSession.SelectItemsPropertyDesc(items, count, function (item) { return [item]; });
            if (typeof simpleItemType === "undefined")
                simpleItemType = true;
            result.SimpleItemType = simpleItemType;
            return result;
        }
        function prepareSelectSimpleItemRange(arg0, rangeStartIndex, rangeEndIndex, arg3, arg4) {
            var source, items, count, simpleItemType;
            if (typeof arg3 !== "undefined" && typeof arg3 !== "boolean") {
                items = arg0;
                count = arg3;
                simpleItemType = arg4;
            }
            else {
                source = arg0;
                simpleItemType = arg3;
                items = source.Items;
                count = source.Count;
                Debug.assert(items && count);
            }
            var result = rpc.TBGSession.SelectItemRangePropertyDesc(items, count, rangeStartIndex, rangeEndIndex, function (item) { return [item]; });
            if (typeof simpleItemType === "undefined")
                simpleItemType = true;
            result.SimpleItemType = simpleItemType;
            return result;
        }
        function ProcessPropValues(source, propertyDescs, propertyValues, callback) {
            try {
                var xOverrides;
                var xValues = SetPropValues(propertyDescs, propertyValues, source, function (obj, data) { return (xOverrides || (xOverrides = [])).push(obj, data); });
                callback(xValues);
            }
            finally {
                DeletePropValues(xValues || source, propertyDescs, xOverrides);
            }
        }
        function DoProcessPropValuesAsync(source, propertyDescs, propertyValues, callback) {
            return __awaiter(this, void 0, void 0, function* () {
                try {
                    var xOverrides;
                    var xValues = SetPropValues(propertyDescs, propertyValues, source, function (obj, data) { return (xOverrides || (xOverrides = [])).push(obj, data); });
                    yield callback(xValues);
                }
                finally {
                    DeletePropValues(xValues || source, propertyDescs, xOverrides);
                }
            });
        }
        function ProcessPropValuesAsync(source, propertyDescs, propertyValues, callback) {
            if (typeof callback === "function") {
                return ProcessPropValues(source, propertyDescs, propertyValues, callback);
            }
            else {
                return DoProcessPropValuesAsync(source, propertyDescs, propertyValues, callback.callback);
            }
        }
        function CallPropsValuesHandler(handler, source, callback, async) {
            if (async && bg.SyncContext) {
                bg.SyncContext.Asap(function () { handler(source, callback); });
            }
            else {
                handler(source, callback);
            }
        }
        function GetSelectPropValuesHandler(source, propertyDescs, type) {
            var xPropertyValues = rpc.TBGSession.GetPropertyValues(source, propertyDescs, type);
            return function (source, callback) { return ProcessPropValues(source, propertyDescs, xPropertyValues, callback); };
        }
        function GetSelectPropValuesHandlerAsync(source, propertyDescs, interfaceType, safeCast) {
            return __awaiter(this, void 0, void 0, function* () {
                var xPropertyValues = yield rpc.TBGSession.GetPropertyValues(source, propertyDescs, interfaceType, safeCast);
                return function (source, callback) { return ProcessPropValuesAsync(source, propertyDescs, xPropertyValues, callback); };
            });
        }
        function GetSelectPropDescs(source, selector, type) {
            var xPropertyDescs = rpc.TBGSession.SelectPropertyDescs(source.constructor, selector);
            return xPropertyDescs;
        }
        function GetSelectIntfCastPropDescs(type, selector, safeCast) {
            var xPropertyDesc = rpc.TBGSession.SelectIntfCastPropertyDesc(type, selector, safeCast);
            return [xPropertyDesc];
        }
        function GetSelectPropsHandlerAsync(source, selector) {
            var xPropertyDescs = GetSelectPropDescs(source, selector);
            return GetSelectPropValuesHandlerAsync(source, xPropertyDescs);
        }
        function GetSelectInterfacePropsHandlerAsync(source, type, selector, safeCast) {
            var xPropertyDescs = GetSelectIntfCastPropDescs(type, selector, safeCast);
            return GetSelectPropValuesHandlerAsync(source, xPropertyDescs, type, safeCast);
        }
        function GetSelectItemListPropDescs(source, selector, arg2, arg3) {
            var xPropertyDesc;
            if (typeof arg2 === "function") {
                var type = arg2, safeCast_1 = arg3;
                xPropertyDesc = rpc.TBGSession.SelectListPropertyDesc(source.constructor, selector, type, safeCast_1);
            }
            else {
                var simpleItemType = arg2;
                xPropertyDesc = rpc.TBGSession.SelectListPropertyDesc(source.constructor, selector);
                if (typeof simpleItemType === "boolean")
                    xPropertyDesc.SimpleItemType = simpleItemType;
            }
            return [xPropertyDesc];
        }
        function GetSelectItemListRangePropDescs(source, rangeStartIndex, rangeEndIndex, selector, arg4, arg5) {
            var xPropertyDesc;
            if (typeof arg4 === "function") {
                var type = arg4, safeCast_2 = arg5;
                xPropertyDesc = rpc.TBGSession.SelectListRangePropertyDesc(source.constructor, rangeStartIndex, rangeEndIndex, selector, type, safeCast_2);
            }
            else {
                var simpleItemType = arg4;
                xPropertyDesc = rpc.TBGSession.SelectListRangePropertyDesc(source.constructor, rangeStartIndex, rangeEndIndex, selector);
                if (typeof simpleItemType === "boolean")
                    xPropertyDesc.SimpleItemType = simpleItemType;
            }
            return [xPropertyDesc];
        }
        function GetSelectCustomItemsPropDescs(source, items, selector, arg3, arg4) {
            var xPropertyDesc;
            if (typeof arg3 === "function") {
                var type = arg3, safeCast_3 = arg4;
                xPropertyDesc = rpc.TBGSession.SelectCustomItemsPropertyDesc(source.constructor, items, selector, type, safeCast_3);
            }
            else {
                var simpleItemType = arg3;
                xPropertyDesc = rpc.TBGSession.SelectCustomItemsPropertyDesc(source.constructor, items, selector);
                if (typeof simpleItemType === "boolean")
                    xPropertyDesc.SimpleItemType = simpleItemType;
            }
            return [xPropertyDesc];
        }
        function GetSelectCustomItemRangePropDescs(source, rangeStartIndex, rangeEndIndex, items, selector, arg5, arg6) {
            var xPropertyDesc;
            if (typeof arg5 === "function") {
                var type = arg5, safeCast_4 = arg6;
                xPropertyDesc = rpc.TBGSession.SelectCustomItemRangePropertyDesc(source.constructor, rangeStartIndex, rangeEndIndex, items, selector, type, safeCast_4);
            }
            else {
                var simpleItemType = arg5;
                xPropertyDesc = rpc.TBGSession.SelectCustomItemRangePropertyDesc(source.constructor, rangeStartIndex, rangeEndIndex, items, selector);
                if (typeof simpleItemType === "boolean")
                    xPropertyDesc.SimpleItemType = simpleItemType;
            }
            return [xPropertyDesc];
        }
        function GetSelectItemListValuesHandler(source, selector, arg2) {
            var xPropertyDescs = GetSelectItemListPropDescs(source, selector, arg2);
            return GetSelectPropValuesHandler(source, xPropertyDescs);
        }
        function GetSelectItemListRangeValuesHandler(source, rangeStartIndex, rangeEndIndex, selector, arg4) {
            var xPropertyDescs = GetSelectItemListRangePropDescs(source, rangeStartIndex, rangeEndIndex, selector, arg4);
            return GetSelectPropValuesHandler(source, xPropertyDescs);
        }
        function GetSelectItemListValuesHandlerAsync(source, selector, arg2) {
            var xPropertyDescs = GetSelectItemListPropDescs(source, selector, arg2);
            return GetSelectPropValuesHandlerAsync(source, xPropertyDescs);
        }
        function GetSelectItemListRangeValuesHandlerAsync(source, rangeStartIndex, rangeEndIndex, selector, arg4) {
            var xPropertyDescs = GetSelectItemListRangePropDescs(source, rangeStartIndex, rangeEndIndex, selector, arg4);
            return GetSelectPropValuesHandlerAsync(source, xPropertyDescs);
        }
        function GetSelectCustomItemsValuesHandler(source, items, selector, arg3) {
            var xPropertyDescs = GetSelectCustomItemsPropDescs(source, items, selector, arg3);
            return GetSelectPropValuesHandler(source, xPropertyDescs);
        }
        function GetSelectCustomItemsValuesHandlerAsync(source, items, selector, simpleItemType) {
            var xPropertyDescs = GetSelectCustomItemsPropDescs(source, items, selector, simpleItemType);
            return GetSelectPropValuesHandlerAsync(source, xPropertyDescs);
        }
        function GetSelectCustomItemRangeValuesHandlerAsync(source, rangeStartIndex, rangeEndIndex, items, selector, simpleItemType) {
            var xPropertyDescs = GetSelectCustomItemRangePropDescs(source, rangeStartIndex, rangeEndIndex, items, selector, simpleItemType);
            return GetSelectPropValuesHandlerAsync(source, xPropertyDescs);
        }
        function selectItemList(source, selector, callback, async) {
            var xHandler = GetSelectItemListValuesHandler(source, selector);
            CallPropsValuesHandler(xHandler, source, callback, async);
        }
        function selectItemListRange(source, rangeStartIndex, rangeEndIndex, selector, callback, async) {
            var xHandler = GetSelectItemListRangeValuesHandler(source, rangeStartIndex, rangeEndIndex, selector);
            CallPropsValuesHandler(xHandler, source, callback, async);
        }
        function selectItems() {
            return selectItemList.apply(this, arguments);
        }
        function selectItemRange() {
            return selectItemListRange.apply(this, arguments);
        }
        function select(arg0, arg1, arg2, arg3) {
            if (typeof arg0 === "function") {
                return prepareSelectCastProps.apply(this, arguments);
            }
            else {
                return prepareSelectProps.apply(this, arguments);
            }
        }
        $imp.select = select;
        function selectAll(source, arg1, arg2) {
            if (source instanceof rtl.SelectorMemberInfo || source["__IsSelectorDict"]) {
                if (typeof arg1 === "function" || typeof arg2 === "function") {
                    var selector = void 0, type = void 0;
                    if (typeof arg1 !== "function") {
                        var count = arg1;
                        selector = arg2;
                        return prepareSelectItems(source, count, selector);
                    }
                    if (typeof arg2 === "function") {
                        type = arg1;
                        selector = arg2;
                        return prepareSelectItems(source, selector, type);
                    }
                    else {
                        selector = arg1;
                        return prepareSelectItems(source, selector);
                    }
                }
                else {
                    return prepareSelectSimpleItems.apply(this, arguments);
                }
            }
            else {
                return selectItems.apply(this, arguments);
            }
        }
        $imp.selectAll = selectAll;
        function selectRange(source, rangeStartIndex, rangeStartEnd, arg3, arg4) {
            if (source instanceof rtl.SelectorMemberInfo || source["__IsSelectorDict"]) {
                if (typeof arg3 === "function" || typeof arg4 === "function") {
                    var selector = void 0, type = void 0;
                    if (typeof arg3 !== "function") {
                        var count = arg3;
                        selector = arg4;
                        return prepareSelectItemRange(source, rangeStartIndex, rangeStartEnd, count, selector);
                    }
                    if (typeof arg4 === "function") {
                        type = arg3;
                        selector = arg4;
                        return prepareSelectItemRange(source, rangeStartIndex, rangeStartEnd, selector, type);
                    }
                    else {
                        selector = arg3;
                        return prepareSelectItemRange(source, rangeStartIndex, rangeStartEnd, selector);
                    }
                }
                else {
                    return prepareSelectSimpleItemRange.apply(this, arguments);
                }
            }
            else {
                return selectItemRange.apply(this, arguments);
            }
        }
        $imp.selectRange = selectRange;
        function selectItemListAsync(source, selector, simpleItemType) {
            return __awaiter(this, void 0, void 0, function* () {
                var handler = yield GetSelectItemListValuesHandlerAsync(source, selector, simpleItemType);
                var result = function (callback) { return handler(source, callback); };
                return result;
            });
        }
        function selectItemListRangeAsync(source, rangeStartIndex, rangeEndIndex, selector, simpleItemType) {
            return __awaiter(this, void 0, void 0, function* () {
                var handler = yield GetSelectItemListRangeValuesHandlerAsync(source, rangeStartIndex, rangeEndIndex, selector, simpleItemType);
                var result = function (callback) { return handler(source, callback); };
                return result;
            });
        }
        function selectInterfaceItemListAsync(source, selector, type) {
            return __awaiter(this, void 0, void 0, function* () {
                var handler = yield GetSelectItemListValuesHandlerAsync(source, selector, type);
                var result = function (callback) { return handler(source, callback); };
                return result;
            });
        }
        function selectInterfaceItemListRangeAsync(source, rangeStartIndex, rangeEndIndex, selector, type) {
            return __awaiter(this, void 0, void 0, function* () {
                var handler = yield GetSelectItemListRangeValuesHandlerAsync(source, rangeStartIndex, rangeEndIndex, selector, type);
                var result = function (callback) { return handler(source, callback); };
                return result;
            });
        }
        function selectCustomItemsAsync(source, items, selector, simpleItemType) {
            return __awaiter(this, void 0, void 0, function* () {
                var handler = yield GetSelectCustomItemsValuesHandlerAsync(source, items, selector, simpleItemType);
                var result = function (callback) { return handler(source, callback); };
                return result;
            });
        }
        function selectCustomItemRangeAsync(source, rangeStartIndex, rangeEndIndex, items, selector, simpleItemType) {
            return __awaiter(this, void 0, void 0, function* () {
                var handler = yield GetSelectCustomItemRangeValuesHandlerAsync(source, rangeStartIndex, rangeEndIndex, items, selector, simpleItemType);
                var result = function (callback) { return handler(source, callback); };
                return result;
            });
        }
        function GetValue(value, callback) {
            return value(callback);
        }
        $imp.GetValue = GetValue;
        function GetValueAsync(value, callback) {
            return value({ callback: callback });
        }
        $imp.GetValueAsync = GetValueAsync;
        function GetValues(valuesf, callback) {
            var i = -1, len = valuesf.length, values = new Array(len);
            var process = function (value) {
                var j = i;
                i++;
                if (j >= 0)
                    values[j] = value;
                if (i == len) {
                    callback(values);
                }
                else {
                    valuesf[i](process);
                }
            };
            process();
        }
        $imp.GetValues = GetValues;
        function selectAllAsync(source, arg1, arg2) {
            Debug.assert(arg1 != null);
            if (typeof arg2 === "boolean") {
                return selectCustomItemsAsync(source, arg1, function (item) { return [item]; }, arg2);
            }
            else if (typeof arg1 === "boolean") {
                return selectItemListAsync(source, function (item) { return [item]; }, arg1);
            }
            else if (typeof arg2 === "undefined") {
                return selectItemListAsync(source, arg1);
            }
            else if (!!arg1.__interface) {
                return selectInterfaceItemListAsync(source, arg2, arg1);
            }
            else {
                return selectCustomItemsAsync(source, arg1, arg2);
            }
        }
        $imp.selectAllAsync = selectAllAsync;
        function selectRangeAsync(source, rangeStartIndex, rangeEndIndex, arg3, arg4) {
            Debug.assert(arg3 != null);
            if (typeof arg4 === "boolean") {
                return selectCustomItemRangeAsync(source, rangeStartIndex, rangeEndIndex, arg3, function (item) { return [item]; }, arg4);
            }
            else if (typeof arg3 === "boolean") {
                return selectItemListRangeAsync(source, rangeStartIndex, rangeEndIndex, function (item) { return [item]; }, arg3);
            }
            else if (typeof arg4 === "undefined") {
                return selectItemListRangeAsync(source, rangeStartIndex, rangeEndIndex, arg3);
            }
            else if (!!arg3.__interface) {
                return selectInterfaceItemListRangeAsync(source, rangeStartIndex, rangeEndIndex, arg4, arg3);
            }
            else {
                return selectCustomItemRangeAsync(source, rangeStartIndex, rangeEndIndex, arg3, arg4);
            }
        }
        $imp.selectRangeAsync = selectRangeAsync;
        function selectAllAsyncValue(source, arg1, arg2, arg3) {
            return __awaiter(this, void 0, void 0, function* () {
                var callback;
                var _value;
                if (typeof arg3 === "function") {
                    callback = arg3;
                    _value = yield selectCustomItemsAsync(source, arg1, arg2);
                }
                else {
                    callback = arg2;
                    _value = yield selectItemListAsync(source, arg1);
                }
                yield GetValueAsync(_value, callback);
            });
        }
        $imp.selectAllAsyncValue = selectAllAsyncValue;
        function selectRangeAsyncValue(source, rangeStartIndex, rangeEndIndex, arg3, arg4, arg5) {
            return __awaiter(this, void 0, void 0, function* () {
                var callback;
                var _value;
                if (typeof arg5 === "function") {
                    callback = arg5;
                    _value = yield selectCustomItemRangeAsync(source, rangeStartIndex, rangeEndIndex, arg3, arg4);
                }
                else {
                    callback = arg4;
                    _value = yield selectItemListRangeAsync(source, rangeStartIndex, rangeEndIndex, arg3);
                }
                yield GetValueAsync(_value, callback);
            });
        }
        $imp.selectRangeAsyncValue = selectRangeAsyncValue;
        function selectAsync(source, arg1, arg2, arg3) {
            return __awaiter(this, void 0, void 0, function* () {
                if (typeof arg3 === "function") {
                    var type = arg1, safeCast_5 = arg2, selector = arg3;
                    var handler_1 = yield GetSelectInterfacePropsHandlerAsync(source, type, selector, safeCast_5);
                    var result = function (callback) { return handler_1(source, callback); };
                    return result;
                }
                else if (typeof arg2 === "function") {
                    var type = arg1, selector = arg2;
                    var handler_2 = yield GetSelectInterfacePropsHandlerAsync(source, type, selector);
                    var result = function (callback) { return handler_2(source, callback); };
                    return result;
                }
                else {
                    var selector = arg1;
                    var handler_3 = yield GetSelectPropsHandlerAsync(source, selector);
                    var result = function (callback) { return handler_3(source, callback); };
                    return result;
                }
            });
        }
        $imp.selectAsync = selectAsync;
        function selectAsyncValue(source, arg1, arg2, arg3, arg4) {
            return __awaiter(this, void 0, void 0, function* () {
                var selector, callback;
                var _value;
                if (typeof arg4 === "function") {
                    var type = arg1, safeCast_6 = arg2;
                    selector = arg3;
                    callback = arg4;
                    _value = yield selectAsync(source, type, safeCast_6, selector);
                }
                else if (typeof arg3 === "function") {
                    var type = arg1;
                    selector = arg2;
                    callback = arg3;
                    _value = yield selectAsync(source, type, selector);
                }
                else {
                    selector = arg1;
                    callback = arg2;
                    _value = yield selectAsync(source, selector);
                }
                yield GetValueAsync(_value, callback);
            });
        }
        $imp.selectAsyncValue = selectAsyncValue;
        function objectId(source) {
            var result = { MemberInfo: source, GetterMethodIndex: 5 };
            return result;
        }
        $imp.objectId = objectId;
        function CreateGetValueFunc(value) {
            return function () { return value; };
        }
        var ItemsSymb;
        function CreateGetItemsFunc(values) {
            var result = function (index) {
                return values[index];
            };
            var s = ItemsSymb || (ItemsSymb = Symbol("Items"));
            result[s] = bg.type_cast({
                Values: values,
                AllItems: true
            });
            return result;
        }
        function CreateGetItemRangeFunc(values, originalItems, obj, rangeStartIndex, rangeEndIndex) {
            var CachedItems = {
                Values: values,
                OriginalItems: originalItems && (function (index) { return originalItems.call(obj, index); }),
                RangeStartIndex: rangeStartIndex,
                RangeEndIndex: rangeEndIndex
            };
            var result = function (index) {
                var xItems = CachedItems;
                do {
                    if (index >= xItems.RangeStartIndex && index < xItems.RangeEndIndex)
                        return xItems.Values[index - xItems.RangeStartIndex];
                } while (xItems = xItems.NextItems);
                return CachedItems.OriginalItems && CachedItems.OriginalItems(index);
            };
            var s = ItemsSymb || (ItemsSymb = Symbol("Items"));
            result[s] = CachedItems;
            return result;
        }
        function IsStubClass(ctor) {
            return typeof ctor === "function" && ctor["__IsSelectStubClass"] === true;
        }
        function IsStubObject(obj) {
            return typeof obj === "object" && IsStubClass(obj.constructor);
        }
        function CreateObjectStubClass(type) {
            var xInterfaces = ss.getInterfaces(type);
            if (ss.isInterface(type)) {
                if (xInterfaces) {
                    xInterfaces = xInterfaces.slice(0);
                    xInterfaces.push(type);
                }
                else {
                    xInterfaces = [type];
                }
            }
            var ctor = function () { };
            ctor["__IsSelectStubClass"] = true;
            if (xInterfaces)
                ctor.__interfaces = xInterfaces;
            return ctor;
        }
        function GetSelectStubClass(type) {
            var result = type["__SelectStubClass"];
            if (!result) {
                result = CreateObjectStubClass(type);
                type["__SelectStubClass"] = result;
            }
            return result;
        }
        function CreateSelectStubObject(type) {
            var xClass = GetSelectStubClass(type);
            return new xClass();
        }
        function IsPropFunc(memberInfo) {
            return memberInfo.Kind == 1 || memberInfo.Name === "Add";
        }
        var WrapQueryInterfaceName = "__$selfCast";
        function QueryInterfaceLocal(source, type) {
            if (!source)
                return;
            var xWrap = source[WrapQueryInterfaceName];
            Debug.assert(xWrap);
            var xCachedCasts = xWrap.CachedCasts;
            var xObj = xCachedCasts.get(type);
            if (xObj)
                return xObj.obj;
            if (typeof debug != "undefined")
                debug.warn("Приведение объекта к типу {0} не закэшировано".format(type.TypeFullName));
            var xQueryInterface = xWrap.Original || source.constructor && source.constructor.prototype.QueryInterface;
            return xQueryInterface && xQueryInterface.call(source, type);
        }
        function QueryInterfaceLocalMethod(type) {
            return QueryInterfaceLocal(this, type);
        }
        function FindIntfCastObject(source, type) {
            var xWrap = source && source[WrapQueryInterfaceName], xObj = xWrap && xWrap.CachedCasts.get(type);
            return xObj && xObj.obj;
        }
        function AssignWrapQueryInterface(dest, source, callback, isstub) {
            Debug.assert(dest && source);
            var xSrcWrap = source[WrapQueryInterfaceName];
            if (xSrcWrap) {
                xSrcWrap.CachedCasts.forEach(function (obj, type) {
                    WrapQueryInterface(dest, type, obj.obj, callback, isstub);
                });
            }
        }
        function WrapQueryInterface(instance, type, intf, callback, isstub) {
            Debug.assert(instance);
            var xWrap = instance[WrapQueryInterfaceName];
            if (!xWrap) {
                xWrap = {
                    Original: instance.hasOwnProperty(NamesOf(IInterface).QueryInterface) ? instance.QueryInterface : null,
                    CachedCasts: new Map()
                };
                instance[WrapQueryInterfaceName] = xWrap;
                instance.QueryInterface = QueryInterfaceLocalMethod;
            }
            else {
                var xObj = xWrap.CachedCasts.get(type);
                if (xObj) {
                    if (!xObj.obj) {
                        xObj.obj = intf;
                    }
                    else if (IsStubObject(xObj.obj)) {
                        MergeStubToObject(xObj.obj, intf, callback, isstub);
                    }
                    else {
                        Debug.assert(xObj.obj == intf);
                    }
                    xObj.cnt++;
                    return;
                }
            }
            xWrap.CachedCasts.set(type, { obj: intf, cnt: 1 });
        }
        function UnWrapQueryInterface(source, type) {
            if (!source)
                return;
            var xWrap = source[WrapQueryInterfaceName];
            if (xWrap) {
                var xObj = xWrap.CachedCasts.get(type);
                if (xObj && (0 == --xObj.cnt)) {
                    xWrap.CachedCasts.delete(type);
                    if (xWrap.CachedCasts.size == 0) {
                        if (xWrap.Original)
                            source.QueryInterface = xWrap.Original;
                        else
                            delete source.QueryInterface;
                        delete source[WrapQueryInterfaceName];
                    }
                }
            }
        }
        function MergeStubToObject(obj, result, callback, isstub) {
            Debug.assert(IsStubObject(obj));
            var xSrcWrap = obj[WrapPropValueName];
            if (xSrcWrap) {
                if (typeof isstub === "undefined")
                    isstub = IsStubObject(result);
                for (var p in obj) {
                    var pd = Object.getOwnPropertyDescriptor(obj, p);
                    if (p == "__ObjectId") {
                        if (!result.hasOwnProperty(p))
                            Object.defineProperty(result, p, pd);
                        continue;
                    }
                    if (p == WrapPropValueName)
                        continue;
                    if (!xSrcWrap[p])
                        continue;
                    Debug.assert(Boolean(DeleteInterceptProp(result, p)) || true);
                    WrapPropValue(result, p, pd);
                    if (!isstub && callback)
                        callback(result, p);
                }
            }
            AssignWrapQueryInterface(result, obj, callback, isstub);
        }
        function DoSetPropValues(props, values, obj, callback, uppLevel) {
            var self, len = props && values ? props.length : 0;
            for (var i = 0; i < len; i++) {
                var prop = props[i];
                if (prop.GetterMethodIndex == -1) {
                    self = values[i].Value;
                    break;
                }
            }
            var result, isstub;
            if (!self) {
                if (typeof obj === "function") {
                    result = CreateSelectStubObject(obj);
                    isstub = true;
                }
                else {
                    Debug.assert(obj);
                    result = obj;
                    isstub = IsStubObject(obj);
                }
            }
            else {
                result = self;
                isstub = false;
                if (typeof obj !== "function") {
                    if (IsStubObject(obj)) {
                        MergeStubToObject(obj, result, callback, isstub);
                    }
                    else {
                        if (obj != self) {
                            Debug.assert(bg.IsDisposedProxyObject(obj));
                            result = obj;
                        }
                    }
                }
            }
            for (var i = 0; i < len; i++) {
                var prop = props[i];
                switch (prop.GetterMethodIndex) {
                    case -1:
                        break;
                    case -2: {
                        var xPropItems = prop, xValueItems = values[i], xCount = xValueItems.Items.length, xCountProp = xPropItems.CountMemberInfo.Kind == 1 ? CreateGetValueFunc(xCount) : xCount;
                        Debug.assert(Boolean(DeleteInterceptProp(result, xPropItems.CountMemberInfo.Name)) || true);
                        WrapPropValue(result, xPropItems.CountMemberInfo.Name, { value: xCountProp, configurable: true, enumerable: true, writable: false });
                        if (!isstub && callback)
                            callback(result, xPropItems.CountMemberInfo.Name);
                        var xItems = new Array(xCount);
                        for (var j = 0; j < xCount; j++) {
                            var xItemJ = xValueItems.Items[j];
                            if (xPropItems.SimpleItemType) {
                                xItems[j] = xItemJ && xItemJ.Value;
                            }
                            else {
                                var xTypeJ = xPropItems.ItemMemberInfo.ReturnType, xElementsJ = xItemJ && xItemJ.Elements;
                                xItems[j] = xElementsJ ? DoSetPropValues(xPropItems.Elements, xElementsJ, xTypeJ, callback) : null;
                            }
                        }
                        var xItemsProp = CreateGetItemsFunc(xItems);
                        Debug.assert(Boolean(DeleteInterceptProp(result, xPropItems.ItemMemberInfo.Name)) || true);
                        WrapPropValue(result, xPropItems.ItemMemberInfo.Name, { value: xItemsProp, configurable: true, enumerable: true, writable: false });
                        if (!isstub && callback)
                            callback(result, xPropItems.ItemMemberInfo.Name);
                        break;
                    }
                    case -3: {
                        var xPropItems = prop, xValueItems = values[i], xRangeCount = xValueItems.Items.length, xRangeStartIndex = xValueItems.RangeStartIndex, xCount = xValueItems.TotalCount, xCountProp = xPropItems.CountMemberInfo.Kind == 1 ? CreateGetValueFunc(xCount) : xCount;
                        Debug.assert(Boolean(DeleteInterceptProp(result, xPropItems.CountMemberInfo.Name)) || true);
                        WrapPropValue(result, xPropItems.CountMemberInfo.Name, { value: xCountProp, configurable: true, enumerable: true, writable: false });
                        if (!isstub && callback)
                            callback(result, xPropItems.CountMemberInfo.Name);
                        var xItemRange = new Array(xRangeCount);
                        for (var j = 0; j < xRangeCount; j++) {
                            var xItemJ = xValueItems.Items[j];
                            if (xPropItems.SimpleItemType) {
                                xItemRange[j] = xItemJ && xItemJ.Value;
                            }
                            else {
                                var xTypeJ = xPropItems.ItemMemberInfo.ReturnType, xElementsJ = xItemJ && xItemJ.Elements;
                                xItemRange[j] = xElementsJ ? DoSetPropValues(xPropItems.Elements, xElementsJ, xTypeJ, callback) : null;
                            }
                        }
                        var xOriginalItems = result[xPropItems.ItemMemberInfo.Name];
                        var xItemsProp = CreateGetItemRangeFunc(xItemRange, xOriginalItems, result, xRangeStartIndex, xRangeStartIndex + xRangeCount);
                        Debug.assert(Boolean(DeleteInterceptProp(result, xPropItems.ItemMemberInfo.Name)) || true);
                        WrapPropValue(result, xPropItems.ItemMemberInfo.Name, { value: xItemsProp, configurable: true, enumerable: true, writable: false });
                        if (!isstub && callback)
                            callback(result, xPropItems.ItemMemberInfo.Name);
                        break;
                    }
                    case -4: {
                        var xPropInterface = prop, xValueInterface = values[i];
                        var xName = xPropInterface.MemberInfo.Name;
                        Debug.assert(!!xName);
                        Debug.assert(Boolean(DeleteInterceptProp(result, xName)) || true);
                        var xObj = result.hasOwnProperty(xName) ? result[xName] : null;
                        if (xObj && IsPropFunc(xPropInterface.MemberInfo))
                            xObj = xObj();
                        var xType = xPropInterface.MemberInfo.ReturnType;
                        xObj = xValueInterface.Elements ? DoSetPropValues(xPropInterface.Elements, xValueInterface.Elements, xObj || xType, callback) : xObj;
                        if (IsPropFunc(xPropInterface.MemberInfo))
                            xObj = CreateGetValueFunc(xObj);
                        WrapPropValue(result, xName, { value: xObj, configurable: true, enumerable: true, writable: false });
                        if (!isstub && callback)
                            callback(result, xName);
                        break;
                    }
                    case -5: {
                        var xPropIntfCast = prop, xValueIntfCast = values[i];
                        Debug.assert(!(xPropIntfCast.MemberInfo && xPropIntfCast.MemberInfo.Name));
                        var xType = xPropIntfCast.InterfaceType;
                        Debug.assert(xType);
                        var xRoot = (uppLevel && len == 1);
                        var xObj = null;
                        if (!xRoot) {
                            xObj = FindIntfCastObject(result, xType);
                            if (!xObj && !isstub && isInstanceOfType(result, xType) && ss.isInterface(xType)) {
                                var xInterfaces = ss.getInterfaces(result.constructor);
                                if (xInterfaces && xInterfaces.length > 0 && xInterfaces[xInterfaces.length - 1] == xType)
                                    xObj = result;
                            }
                        }
                        var xElements = xValueIntfCast.Elements;
                        if (xRoot) {
                            Debug.assert(xPropIntfCast.IgnoreIntfCastError || xElements);
                            Debug.assert(!xElements || xElements.length == 1);
                            xElements = xElements && xElements[0].Elements;
                        }
                        if (xElements)
                            xObj = DoSetPropValues(xPropIntfCast.Elements, xElements, xObj || xType, callback);
                        else
                            xObj = null;
                        if (xRoot) {
                            result = xObj;
                            if (!result)
                                return result;
                        }
                        else {
                            WrapQueryInterface(result, xType, xObj, callback, isstub);
                            if (!isstub && callback)
                                callback(result, xType);
                        }
                        break;
                    }
                    case 5: {
                        var xValue = values[i];
                        if (xValue.Result)
                            result["__ObjectId"] = xValue.ObjectId;
                        break;
                    }
                    default: {
                        var xValueSimple = values[i], xValue = xValueSimple.Value, xName = prop.MemberInfo.Name;
                        Debug.assert(Boolean(DeleteInterceptProp(result, xName)) || true);
                        if (IsPropFunc(prop.MemberInfo)) {
                            xValue = CreateGetValueFunc(xValue);
                            WrapPropValue(result, xName, { value: xValue, configurable: true, enumerable: true, writable: false });
                        }
                        else {
                            var proto = result.constructor.prototype, pd = proto && Object.getOwnPropertyDescriptor(proto, xName);
                            if (!pd) {
                                var basetype = ss.getBaseType(result.constructor);
                                Debug.assert(basetype != ss.getBaseType(rpc.TBGProxyClassHelper.GetProxyClass(IInterface)));
                                if (basetype && basetype != Object) {
                                    var proto_1 = basetype.prototype;
                                    pd = proto_1 && Object.getOwnPropertyDescriptor(proto_1, xName);
                                }
                            }
                            if (pd && pd.set)
                                WrapPropValue(result, xName, GetCachedChangablePropDesc(xValue, pd.set));
                            else
                                WrapPropValue(result, xName, { value: xValue, configurable: true, enumerable: true, writable: false });
                        }
                        if (!isstub && callback)
                            callback(result, xName);
                    }
                }
            }
            Debug.assert(Boolean(InterceptPropertiesDebug(result)) || true);
            return result;
        }
        function SetPropValues(props, values, obj, callback) {
            return DoSetPropValues(props, values, obj, callback, true);
        }
        function GetCachedChangablePropDesc(value, setter) {
            var _value = value;
            return {
                get: function () {
                    return _value;
                },
                set: function (value) {
                    var result = setter.call(this, value);
                    if (result instanceof Promise) {
                        Debug.assert(typeof __awaiter === "undefined" || __awaiter.__se === result);
                        result = result.then(function () {
                            _value = value;
                        });
                        if (typeof __awaiter !== "undefined")
                            __awaiter.__se = result;
                    }
                    else {
                        _value = value;
                    }
                    return result;
                },
                configurable: true, enumerable: true
            };
        }
        var WrapPropValueName = "__$cachedProps";
        function PropertyCached(source, propertyName) {
            var xWrapPropValues = source[WrapPropValueName];
            return !!xWrapPropValues && xWrapPropValues.hasOwnProperty(propertyName);
        }
        $imp.PropertyCached = PropertyCached;
        function IsCachedObject(source) {
            var xWrapPropValues = source[WrapPropValueName];
            for (var key in xWrapPropValues)
                return true;
            return false;
        }
        $imp.IsCachedObject = IsCachedObject;
        function MergeItems(dst, src) {
            var xDstItems = dst[ItemsSymb], xSrcItems = src[ItemsSymb];
            Debug.assert(xDstItems && xDstItems.Values instanceof Array && xSrcItems && xSrcItems.Values instanceof Array);
            if (xSrcItems.AllItems)
                return true;
            if (xDstItems.AllItems) {
                for (var i = 0, s = xSrcItems.Values, l = s.length, offset = xSrcItems.RangeStartIndex, d = xDstItems.Values; i < l; i++)
                    d[offset + i] = s[i];
            }
            else {
                Debug.assert(!xSrcItems.NextItems);
                var xDstCopy = __assign({}, xDstItems);
                xDstItems.RangeStartIndex = xSrcItems.RangeStartIndex;
                xDstItems.RangeEndIndex = xSrcItems.RangeEndIndex;
                xDstItems.Values = xSrcItems.Values;
                xDstItems.NextItems = xDstCopy;
            }
            return false;
        }
        function WrapPropValue(obj, name, pd) {
            Debug.assert(obj);
            var xWrap = obj[WrapPropValueName];
            if (!xWrap) {
                obj[WrapPropValueName] = xWrap = bg.CreateDictionary();
                xWrap[name] = 1;
                Object.defineProperty(obj, name, pd);
            }
            else {
                var xCnt = xWrap[name];
                if (xCnt > 0 && ItemsSymb && obj[name] && obj[name][ItemsSymb]) {
                    xWrap[name] = xCnt + 1;
                    if (MergeItems(obj[name], pd.value))
                        Object.defineProperty(obj, name, pd);
                }
                else {
                    xWrap[name] = (xCnt | 0) + 1;
                    Object.defineProperty(obj, name, pd);
                }
            }
        }
        function UnWrapPropValue(obj, name) {
            if (!obj)
                return;
            var xWrap = obj[WrapPropValueName];
            if (xWrap) {
                var xCnt = xWrap[name];
                if (xCnt) {
                    if (--xCnt == 0) {
                        delete obj[name];
                        delete xWrap[name];
                    }
                    else {
                        xWrap[name] = xCnt;
                    }
                }
            }
        }
        function DeletePropValues(obj, props, overrides) {
            Debug.assert(Boolean(DoDeleteInterceptProps(obj, props, true)) || true);
            for (var i = 0, len = overrides ? overrides.length : 0; i < len; i += 2) {
                var obj_1 = overrides[i], data = overrides[i + 1];
                if (typeof data === "string") {
                    var name_1 = data;
                    UnWrapPropValue(obj_1, name_1);
                }
                else {
                    var type = data;
                    UnWrapQueryInterface(obj_1, type);
                }
            }
        }
        var TBGObjectProxy;
        function InterceptPropertiesDebug(obj) {
            if (!$imp.InterceptPropertiesDebugEnabled)
                return;
            var xInterceptProps;
            xInterceptProps = InterceptPropertiesDebugLog(obj, obj.constructor.prototype, xInterceptProps);
            if (!TBGObjectProxy)
                TBGObjectProxy = ss.getBaseType(rpc.TBGProxyClassHelper.GetProxyClass(IInterface));
            var basetype = ss.getBaseType(obj.constructor);
            if (basetype && basetype != Object && basetype != TBGObjectProxy)
                xInterceptProps = InterceptPropertiesDebugLog(obj, basetype.prototype, xInterceptProps);
            if (xInterceptProps)
                obj["__InterceptProps"] = xInterceptProps;
        }
        function InterceptPropertiesDebugLog(obj, proto, interceptProps) {
            for (var p in proto)
                if (proto.hasOwnProperty(p) && p != "constructor") {
                    if (!obj.hasOwnProperty(p)) {
                        var pd = Object.getOwnPropertyDescriptor(proto, p);
                        if (InterceptPropertyDebugLog(pd, p)) {
                            Object.defineProperty(obj, p, pd);
                            if (!interceptProps)
                                interceptProps = {};
                            interceptProps[p] = true;
                        }
                    }
                }
            return interceptProps;
        }
        function InterceptPropertyDebugLog(pd, p) {
            var result = false;
            if (p == "Add")
                return result;
            if (p && p.length > 0 && p.charAt(0) == '$')
                return result;
            var get = pd.get;
            if (get && get.length == 0) {
                pd.get = function () {
                    if (typeof debug != "undefined")
                        debug.warn("Получение значения незакэшированного свойства " + p);
                    return get.apply(this, arguments);
                };
                result = true;
            }
            else {
                var value = pd.value;
                if (typeof value === "function") {
                    var isGet = p.indexOf("get_") == 0;
                    var isSet = p.indexOf("set_") == 0;
                    if (!isGet && !isSet && value.length == 0) {
                        var func = value;
                        pd.value = function () {
                            if (typeof debug != "undefined")
                                debug.warn("Получение незакэшированного значения результата функции " + p);
                            return func.apply(this, arguments);
                        };
                        result = true;
                    }
                }
            }
            return result;
        }
        function DeleteInterceptProp(obj, name) {
            if (!$imp.InterceptPropertiesDebugEnabled)
                return;
            var xInterceptProps = obj["__InterceptProps"];
            if (xInterceptProps && xInterceptProps.hasOwnProperty(name) && xInterceptProps[name]) {
                if (obj.hasOwnProperty(name))
                    delete obj[name];
                delete xInterceptProps[name];
            }
        }
        function DeleteInterceptProps(obj) {
            if (obj && typeof obj === "object") {
                var xInterceptProps = obj["__InterceptProps"];
                if (xInterceptProps) {
                    for (var p in xInterceptProps)
                        if (xInterceptProps.hasOwnProperty(p) && xInterceptProps[p] && obj.hasOwnProperty(p))
                            delete obj[p];
                    delete obj["__InterceptProps"];
                }
            }
        }
        function GetPropValue(obj, memberInfo) {
            var xName = memberInfo && memberInfo.Name;
            return xName && obj && obj.hasOwnProperty(xName) && obj[xName];
        }
        function DoDeleteInterceptProps(obj, props, uppLevel) {
            if (!$imp.InterceptPropertiesDebugEnabled)
                return;
            if (!obj)
                return;
            for (var i = 0, len = props ? props.length : 0; i < len; i++) {
                var prop = props[i];
                switch (prop.GetterMethodIndex) {
                    case -1:
                        break;
                    case -3:
                    case -2:
                        var xPropItems = prop;
                        var xGetItem = GetPropValue(obj, xPropItems.ItemMemberInfo);
                        var xItemsContext = xGetItem[ItemsSymb];
                        do {
                            var xValues = xItemsContext.Values;
                            for (var i_1 = 0, xLength = xValues.length; i_1 < xLength; ++i_1)
                                DoDeleteInterceptProps(xValues[i_1], xPropItems.Elements);
                            Debug.assert(!(xItemsContext.AllItems && xItemsContext.NextItems));
                        } while (xItemsContext = xItemsContext.NextItems);
                        break;
                    case -4:
                        var xPropInterface = prop;
                        Debug.assert(!!xPropInterface.MemberInfo.Name);
                        var xInterface = GetPropValue(obj, xPropInterface.MemberInfo);
                        if (xInterface) {
                            if (IsPropFunc(xPropInterface.MemberInfo))
                                xInterface = xInterface();
                            DoDeleteInterceptProps(xInterface, xPropInterface.Elements);
                        }
                        break;
                    case -5:
                        var xPropIntfCast = prop;
                        var xRoot = (uppLevel && len == 1);
                        var xObj = xRoot ? obj : FindIntfCastObject(obj, xPropIntfCast.InterfaceType);
                        if (xObj) {
                            DoDeleteInterceptProps(xObj, xPropIntfCast.Elements);
                        }
                        break;
                    default:
                        break;
                }
            }
            Debug.assert(Boolean(DeleteInterceptProps(obj)) || true);
        }
        $imp.InterceptPropertiesDebugEnabled = true;
    })($imp = rpc.$imp || (rpc.$imp = {}));
})(rpc || (rpc = {}));
var bg;
(function (bg) {
    bg.GetValue = rpc.$imp.GetValue;
    bg.GetValueAsync = rpc.$imp.GetValueAsync;
    bg.GetValues = rpc.$imp.GetValues;
    bg.selectAsync = rpc.$imp.selectAsync;
    bg.selectAsyncValue = rpc.$imp.selectAsyncValue;
    bg.selectAllAsync = rpc.$imp.selectAllAsync;
    bg.selectAllAsyncValue = rpc.$imp.selectAllAsyncValue;
    bg.selectRangeAsync = rpc.$imp.selectRangeAsync;
    bg.selectRangeAsyncValue = rpc.$imp.selectRangeAsyncValue;
    bg.select = rpc.$imp.select;
    bg.selectAll = rpc.$imp.selectAll;
    bg.selectRange = rpc.$imp.selectRange;
    bg.objectId = rpc.$imp.objectId;
    bg.PropertyCached = rpc.$imp.PropertyCached;
    bg.IsCachedObject = rpc.$imp.IsCachedObject;
})(bg || (bg = {}));
