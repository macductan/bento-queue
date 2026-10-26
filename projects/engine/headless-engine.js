(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  function __accessProp(key) {
    return this[key];
  }
  var __toCommonJS = (from) => {
    var entry = (__moduleCache ??= new WeakMap).get(from), desc;
    if (entry)
      return entry;
    entry = __defProp({}, "__esModule", { value: true });
    if (from && typeof from === "object" || typeof from === "function") {
      for (var key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(entry, key))
          __defProp(entry, key, {
            get: __accessProp.bind(from, key),
            enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
          });
    }
    __moduleCache.set(from, entry);
    return entry;
  };
  var __moduleCache;
  var __returnValue = (v) => v;
  function __exportSetter(name, newValue) {
    this[name] = __returnValue.bind(null, newValue);
  }
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, {
        get: all[name],
        enumerable: true,
        configurable: true,
        set: __exportSetter.bind(all, name)
      });
  };

  // src/utils/headless-engine.ts
  var exports_headless_engine = {};
  __export(exports_headless_engine, {
    applyScriptUpdatesInMemory: () => applyScriptUpdatesInMemory,
    buildExecuteRequest: () => buildExecuteRequest,
    countStepsInNodes: () => countStepsInNodes,
    evaluateCustomBranchCondition: () => evaluateCustomBranchCondition,
    evaluateStepVerdict: () => evaluateStepVerdict,
    executeScript: () => executeScript,
    finalizeResponseExecution: () => finalizeResponseExecution,
    generateCurlCommand: () => generateCurlCommand,
    getAuthArtifacts: () => getAuthArtifacts,
    getDefaultHeaders: () => getDefaultHeaders,
    getInheritedHeaders: () => getInheritedHeaders,
    isCurlCommand: () => isCurlCommand,
    mergeHeaders: () => mergeHeaders,
    mergeParallelScriptUpdates: () => mergeParallelScriptUpdates,
    parseCurlCommand: () => parseCurlCommand,
    parseUrl: () => parseUrl,
    parseVariables: () => parseVariables,
    prepareHeadlessExecution: () => prepareHeadlessExecution,
    prepareRequestExecution: () => prepareRequestExecution,
    reconcileParamsFromUrl: () => reconcileParamsFromUrl,
    reconcilePathParamsFromUrl: () => reconcilePathParamsFromUrl,
    reconcileUrlAndParams: () => reconcileUrlAndParams,
    resolveAuth: () => resolveAuth,
    resolveEffectiveAuth: () => resolveEffectiveAuth,
    resolveHeaders: () => resolveHeaders,
    resolveHierarchyVariables: () => resolveHierarchyVariables,
    resolvePathParamsInUrl: () => resolvePathParamsInUrl,
    resolveVariables: () => resolveVariables,
    runHeadlessPostResponse: () => runHeadlessPostResponse,
    runPostResponseScript: () => runPostResponseScript,
    runPreRequestScript: () => runPreRequestScript,
    selectMatchingBranch: () => selectMatchingBranch,
    stripJsonComments: () => stripJsonComments,
    stripJsoncToJson: () => stripJsoncToJson,
    toBase64: () => toBase64,
    updateUrlWithParams: () => updateUrlWithParams
  });

  // src/utils/urlParams.ts
  function splitPreservingVars(str, delimiter, limit) {
    const result = [];
    let current = "";
    let inVarDepth = 0;
    let splitsCount = 0;
    for (let i = 0;i < str.length; i++) {
      if (limit && splitsCount >= limit - 1) {
        current += str.substring(i);
        break;
      }
      if (str[i] === "{" && str[i + 1] === "{") {
        inVarDepth++;
        current += "{{";
        i++;
        continue;
      }
      if (str[i] === "}" && str[i + 1] === "}" && inVarDepth > 0) {
        inVarDepth--;
        current += "}}";
        i++;
        continue;
      }
      if (inVarDepth === 0 && str[i] === delimiter) {
        result.push(current);
        current = "";
        splitsCount++;
        continue;
      }
      current += str[i];
    }
    result.push(current);
    return result;
  }
  function encodeQueryComponent(str) {
    if (!str)
      return "";
    const varRegex = /\{\{[^}]+\}\}/g;
    let result = "";
    let lastIndex = 0;
    let match;
    while ((match = varRegex.exec(str)) !== null) {
      if (match.index > lastIndex) {
        result += encodeURIComponent(str.substring(lastIndex, match.index));
      }
      result += match[0];
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < str.length) {
      result += encodeURIComponent(str.substring(lastIndex));
    }
    return result;
  }
  function safeDecode(plain) {
    try {
      return decodeURIComponent(plain);
    } catch {
      return plain;
    }
  }
  function decodeQueryComponent(str) {
    if (!str)
      return "";
    const varRegex = /\{\{[^}]+\}\}/g;
    let result = "";
    let lastIndex = 0;
    let match;
    while ((match = varRegex.exec(str)) !== null) {
      if (match.index > lastIndex) {
        result += safeDecode(str.substring(lastIndex, match.index));
      }
      result += match[0];
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < str.length) {
      result += safeDecode(str.substring(lastIndex));
    }
    return result;
  }
  function parseQueryParams(queryString) {
    if (!queryString)
      return [];
    let cleanQuery = queryString;
    if (cleanQuery.startsWith("?")) {
      cleanQuery = cleanQuery.slice(1);
    }
    if (!cleanQuery)
      return [];
    const segments = splitPreservingVars(cleanQuery, "&");
    const params = [];
    for (const segment of segments) {
      if (segment.length === 0)
        continue;
      const eqParts = splitPreservingVars(segment, "=", 2);
      const rawKey = eqParts[0];
      const rawVal = eqParts.length > 1 ? eqParts[1] : "";
      const key = decodeQueryComponent(rawKey);
      const value = decodeQueryComponent(rawVal);
      params.push({
        key,
        value,
        enabled: true
      });
    }
    return params;
  }
  function parseUrl(url) {
    if (!url) {
      return { baseUrl: "", params: [], hash: "" };
    }
    const hashParts = splitPreservingVars(url, "#", 2);
    const withoutHash = hashParts[0] ?? "";
    const hash = hashParts.length > 1 ? "#" + hashParts[1] : "";
    const queryParts = splitPreservingVars(withoutHash, "?", 2);
    const baseUrl = queryParts[0] ?? "";
    const rawQuery = queryParts.length > 1 ? queryParts[1] : "";
    const params = parseQueryParams(rawQuery);
    return { baseUrl, params, hash };
  }
  function buildQueryString(params) {
    if (!params || params.length === 0)
      return "";
    const activeParams = params.filter((p) => p.enabled && p.key !== "");
    if (activeParams.length === 0)
      return "";
    return activeParams.map((p) => {
      const encodedKey = encodeQueryComponent(p.key);
      if (p.value === "") {
        return encodedKey;
      }
      return `${encodedKey}=${encodeQueryComponent(p.value)}`;
    }).join("&");
  }
  function updateUrlWithParams(currentUrl, params) {
    if (!currentUrl) {
      const qs = buildQueryString(params);
      return qs ? `?${qs}` : "";
    }
    const { baseUrl, hash } = parseUrl(currentUrl);
    const qs = buildQueryString(params);
    if (!qs) {
      return `${baseUrl}${hash}`;
    }
    return `${baseUrl}?${qs}${hash}`;
  }
  function reconcileParamsFromUrl(url, currentParams = []) {
    const { params: parsedList } = parseUrl(url);
    if (parsedList.length === 0) {
      return currentParams.filter((p) => !p.enabled);
    }
    const result = [];
    let parsedIdx = 0;
    for (const item of currentParams) {
      if (!item.enabled) {
        result.push({ ...item });
      } else {
        if (parsedIdx < parsedList.length) {
          result.push({ ...item, ...parsedList[parsedIdx] });
          parsedIdx++;
        }
      }
    }
    while (parsedIdx < parsedList.length) {
      result.push({ ...parsedList[parsedIdx] });
      parsedIdx++;
    }
    return result;
  }
  function findPathParamTokens(url) {
    if (!url)
      return [];
    const masked = url.replace(/\{\{[^}]*\}\}/g, (m) => " ".repeat(m.length));
    const queryOrHashIdx = masked.search(/[?#]/);
    const scanEnd = queryOrHashIdx === -1 ? masked.length : queryOrHashIdx;
    let scanStart = 0;
    const schemeMatch = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.exec(masked);
    if (schemeMatch) {
      const afterScheme = schemeMatch[0].length;
      const slashIdx = masked.indexOf("/", afterScheme);
      if (slashIdx === -1 || slashIdx >= scanEnd) {
        return [];
      }
      scanStart = slashIdx;
    } else if (!masked.startsWith("/") && !masked.startsWith(":")) {
      const slashIdx = masked.indexOf("/");
      if (slashIdx === -1 || slashIdx >= scanEnd) {
        return [];
      }
      scanStart = slashIdx;
    }
    const matches = [];
    const regex = /:([a-zA-Z_][a-zA-Z0-9_-]*)/g;
    regex.lastIndex = scanStart;
    let m;
    while ((m = regex.exec(masked)) !== null) {
      if (m.index >= scanEnd) {
        break;
      }
      const afterIdx = m.index + m[0].length;
      if (afterIdx > scanEnd) {
        break;
      }
      if (masked.slice(afterIdx, afterIdx + 2) === "//") {
        continue;
      }
      matches.push({
        name: m[1],
        raw: m[0],
        startIndex: m.index,
        endIndex: afterIdx
      });
    }
    return matches;
  }
  function extractPathParamKeys(url) {
    const tokens = findPathParamTokens(url);
    const seen = new Set;
    const keys = [];
    for (const t of tokens) {
      if (!seen.has(t.name)) {
        seen.add(t.name);
        keys.push(t.name);
      }
    }
    return keys;
  }
  function reconcilePathParamsFromUrl(url, currentPathParams = []) {
    const keys = extractPathParamKeys(url);
    if (keys.length === 0) {
      return [];
    }
    const existingByKey = new Map;
    for (const item of currentPathParams || []) {
      if (item && item.key && !existingByKey.has(item.key)) {
        existingByKey.set(item.key, item);
      }
    }
    return keys.map((key) => {
      const existing = existingByKey.get(key);
      if (existing) {
        return {
          ...existing,
          key,
          value: existing.value ?? "",
          enabled: existing.enabled !== undefined ? existing.enabled : true
        };
      }
      return {
        key,
        value: "",
        enabled: true
      };
    });
  }
  function resolvePathParamsInUrl(url, pathParams = [], fallbackVars) {
    if (!url)
      return "";
    const tokens = findPathParamTokens(url);
    if (tokens.length === 0)
      return url;
    const paramMap = new Map;
    for (const item of pathParams || []) {
      if (item && item.key) {
        paramMap.set(item.key, { value: item.value ?? "", enabled: item.enabled !== false });
      }
    }
    let result = "";
    let lastIndex = 0;
    for (const token of tokens) {
      result += url.slice(lastIndex, token.startIndex);
      const entry = paramMap.get(token.name);
      let replacement;
      if (entry && entry.enabled && entry.value !== "") {
        replacement = entry.value;
      } else if ((!entry || entry.enabled) && fallbackVars?.has(token.name)) {
        replacement = fallbackVars.get(token.name);
      }
      if (replacement !== undefined) {
        result += replacement;
      } else {
        result += token.raw;
      }
      lastIndex = token.endIndex;
    }
    result += url.slice(lastIndex);
    return result;
  }

  // src/utils/variables.ts
  var VARIABLE_PATTERN_STR = "\\{\\{([^}]+)\\}\\}";
  function resolveVariables(input, vars) {
    if (!input)
      return input;
    const pattern = new RegExp(VARIABLE_PATTERN_STR, "g");
    return input.replace(pattern, (match, key) => {
      const trimmedKey = key.trim();
      if (vars.has(trimmedKey)) {
        return vars.get(trimmedKey);
      }
      return match;
    });
  }
  function resolvePathParamValue(key, vars, pathParams) {
    let explicitlyDisabled = false;
    if (pathParams) {
      if (pathParams instanceof Map) {
        if (pathParams.has(key)) {
          const val = pathParams.get(key) ?? "";
          if (val !== "") {
            return resolveVariables(val, vars);
          }
        }
      } else if (Array.isArray(pathParams)) {
        for (const item of pathParams) {
          if (item && typeof item.key === "string" && item.key.trim() === key) {
            if (item.enabled === false) {
              explicitlyDisabled = true;
            } else if (item.value && item.value !== "") {
              return resolveVariables(item.value, vars);
            }
          }
        }
      }
    }
    if (!explicitlyDisabled && vars.has(key)) {
      const envVal = vars.get(key);
      if (envVal !== "") {
        return envVal;
      }
    }
    return;
  }
  function parseVariables(input, vars, options) {
    if (!input)
      return [];
    const tokens = [];
    const pattern = new RegExp(VARIABLE_PATTERN_STR, "g");
    let match;
    while ((match = pattern.exec(input)) !== null) {
      tokens.push({
        start: match.index,
        end: match.index + match[0].length,
        key: match[1].trim(),
        original: match[0],
        kind: "template"
      });
    }
    if (options?.enablePathParams) {
      const pathTokens = findPathParamTokens(input);
      for (const pt of pathTokens) {
        const overlaps = tokens.some((t) => pt.startIndex < t.end && pt.endIndex > t.start);
        if (!overlaps) {
          tokens.push({
            start: pt.startIndex,
            end: pt.endIndex,
            key: pt.name,
            original: pt.raw,
            kind: "path"
          });
        }
      }
      tokens.sort((a, b) => a.start - b.start);
    }
    const segments = [];
    let lastIndex = 0;
    for (const tok of tokens) {
      const textBefore = input.substring(lastIndex, tok.start);
      if (textBefore) {
        segments.push({ type: "text", value: textBefore });
      }
      if (tok.kind === "path") {
        const resolvedVal = resolvePathParamValue(tok.key, vars, options?.pathParams);
        if (resolvedVal !== undefined) {
          segments.push({
            type: "resolved",
            value: resolvedVal,
            original: tok.original,
            key: tok.key,
            kind: "path"
          });
        } else {
          segments.push({
            type: "missing",
            value: tok.original,
            key: tok.key,
            kind: "path"
          });
        }
      } else {
        if (vars.has(tok.key)) {
          segments.push({
            type: "resolved",
            value: vars.get(tok.key),
            original: tok.original,
            key: tok.key
          });
        } else {
          segments.push({
            type: "missing",
            value: tok.original,
            key: tok.key
          });
        }
      }
      lastIndex = tok.end;
    }
    const textAfter = input.substring(lastIndex);
    if (textAfter) {
      segments.push({ type: "text", value: textAfter });
    }
    return segments;
  }

  // src/utils/headers.ts
  function getInheritedHeaders(pathNodes = []) {
    if (!pathNodes || pathNodes.length === 0)
      return [];
    const folderNodes = pathNodes.filter((n) => n && n.type === "folder");
    if (folderNodes.length === 0)
      return [];
    let effectiveHeaders = [];
    for (let i = 0;i < folderNodes.length; i++) {
      const folder = folderNodes[i];
      if (!folder.headers || folder.headers.length === 0)
        continue;
      const subfolderHeaders = folder.headers.filter((h) => h && typeof h.key === "string" && h.key.trim() !== "").map((h) => ({
        ...h,
        folderLevel: i + 1,
        folderName: folder.name
      }));
      effectiveHeaders = mergeHeaders(subfolderHeaders, effectiveHeaders);
    }
    return effectiveHeaders;
  }
  function mergeHeaders(requestHeaders = [], inheritedHeaders = []) {
    const reqHeaders = requestHeaders || [];
    const inhHeaders = inheritedHeaders || [];
    const reqKeySet = new Set;
    for (const h of reqHeaders) {
      if (!h || h._isAuto || typeof h.key !== "string")
        continue;
      const trimmedKey = h.key.trim();
      if (!trimmedKey)
        continue;
      reqKeySet.add(trimmedKey.toLowerCase());
    }
    const result = [];
    for (const h of inhHeaders) {
      if (!h || typeof h.key !== "string")
        continue;
      const trimmedKey = h.key.trim();
      if (!trimmedKey || !h.enabled)
        continue;
      const lowerKey = trimmedKey.toLowerCase();
      if (!reqKeySet.has(lowerKey)) {
        result.push({
          ...h,
          key: trimmedKey,
          value: h.value || "",
          enabled: true
        });
      }
    }
    for (const h of reqHeaders) {
      if (!h || h._isAuto || typeof h.key !== "string")
        continue;
      const trimmedKey = h.key.trim();
      if (!trimmedKey || !h.enabled)
        continue;
      result.push({
        ...h,
        key: trimmedKey,
        value: h.value || "",
        enabled: true
      });
    }
    return result;
  }
  function getDefaultHeaders(req, inheritedHeaders = [], authHeaders = []) {
    const items = [];
    const safeInherited = inheritedHeaders || [];
    const safeAuth = authHeaders || [];
    const reqEnabledKeys = new Set;
    const reqDisabledKeys = new Set;
    if (req?.headers) {
      for (const h of req.headers) {
        if (h && typeof h.key === "string") {
          if (h._isAuto && h.enabled)
            continue;
          const trimmed = h.key.trim();
          if (trimmed) {
            const lower = trimmed.toLowerCase();
            if (h.enabled) {
              reqEnabledKeys.add(lower);
            } else {
              reqDisabledKeys.add(lower);
            }
          }
        }
      }
    }
    const checkStatus = (lowerKey) => {
      if (reqEnabledKeys.has(lowerKey)) {
        return { overridden: true, disabled: false };
      }
      if (reqDisabledKeys.has(lowerKey)) {
        return { overridden: false, disabled: true };
      }
      return { overridden: false, disabled: false };
    };
    const authKeySet = new Set;
    for (const h of safeAuth) {
      if (h && typeof h.key === "string" && h.key.trim() && h.enabled) {
        authKeySet.add(h.key.trim().toLowerCase());
      }
    }
    for (const h of safeInherited) {
      if (!h || typeof h.key !== "string")
        continue;
      const trimmedKey = h.key.trim();
      if (!trimmedKey || !h.enabled)
        continue;
      const lowerKey = trimmedKey.toLowerCase();
      const { overridden, disabled } = checkStatus(lowerKey);
      const isOverriddenByAuth = authKeySet.has(lowerKey);
      items.push({
        key: trimmedKey,
        value: h.value || "",
        ...h.rawValue !== undefined ? { rawValue: h.rawValue } : {},
        source: "folder",
        folderLevel: h.folderLevel ?? 1,
        folderName: h.folderName,
        overridden: overridden || isOverriddenByAuth,
        disabled
      });
    }
    for (const h of safeAuth) {
      if (!h || typeof h.key !== "string")
        continue;
      const trimmedKey = h.key.trim();
      if (!trimmedKey || !h.enabled)
        continue;
      const lowerKey = trimmedKey.toLowerCase();
      const { overridden, disabled } = checkStatus(lowerKey);
      items.push({
        key: trimmedKey,
        value: h.value || "",
        source: "auth",
        authSource: h.authSource,
        folderLevel: h.folderLevel,
        folderName: h.folderName,
        overridden,
        disabled
      });
    }
    const autoContentTypeMap = {
      json: "application/json",
      xml: "application/xml",
      urlencoded: "application/x-www-form-urlencoded",
      formdata: "multipart/form-data"
    };
    const autoCt = req?.body?.type ? autoContentTypeMap[req.body.type] : undefined;
    if (autoCt) {
      const hasInheritedContentType = items.some((item) => item.key.toLowerCase() === "content-type");
      if (!hasInheritedContentType) {
        const { overridden, disabled } = checkStatus("content-type");
        items.push({
          key: "Content-Type",
          value: autoCt,
          source: "auto",
          overridden,
          disabled
        });
      }
    }
    return items;
  }

  // src/utils/auth.ts
  function pickEntityAuth(globalAuth, authEnvs, activeEnvId) {
    if (activeEnvId && authEnvs && authEnvs[activeEnvId]) {
      const envAuth = authEnvs[activeEnvId];
      if (envAuth && envAuth.type && envAuth.type !== "inherit") {
        return envAuth;
      }
    }
    return globalAuth;
  }
  function resolveEffectiveAuth(auth, pathNodes = [], options) {
    const activeEnvId = options?.activeEnvId;
    const targetAuth = pickEntityAuth(auth, options?.requestAuthEnvs, activeEnvId);
    if (targetAuth && targetAuth.type && targetAuth.type !== "inherit") {
      return { auth: targetAuth };
    }
    const folderNodes = (pathNodes || []).filter((n) => n && n.type === "folder");
    for (let i = folderNodes.length - 1;i >= 0; i--) {
      const node = folderNodes[i];
      const nodeAuth = pickEntityAuth(node.auth, node.auth_envs, activeEnvId);
      if (nodeAuth && nodeAuth.type && nodeAuth.type !== "inherit") {
        return {
          auth: nodeAuth,
          sourceNode: node
        };
      }
    }
    if (options?.collection) {
      const collAuth = pickEntityAuth(options.collection.auth, options.collection.auth_envs, activeEnvId);
      if (collAuth && collAuth.type && collAuth.type !== "inherit") {
        return {
          auth: collAuth,
          sourceCollection: {
            id: options.collection.id,
            name: options.collection.name
          }
        };
      }
    }
    return {
      auth: { type: "none" }
    };
  }
  function toBase64(str) {
    try {
      const bytes = new TextEncoder().encode(str);
      const binString = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
      return btoa(binString);
    } catch {
      return "";
    }
  }
  function getAuthArtifacts(auth, vars = new Map) {
    const headers = [];
    const params = [];
    if (!auth || !auth.type || auth.type === "none" || auth.type === "inherit") {
      return { headers, params };
    }
    switch (auth.type) {
      case "bearer": {
        const rawToken = auth.bearer?.token || "";
        const token = resolveVariables(rawToken, vars).trim();
        if (token !== "") {
          headers.push({
            key: "Authorization",
            value: `Bearer ${token}`,
            enabled: true
          });
        }
        break;
      }
      case "basic": {
        const rawUser = auth.basic?.username || "";
        const rawPass = auth.basic?.password || "";
        const user = resolveVariables(rawUser, vars);
        const pass = resolveVariables(rawPass, vars);
        if (user !== "" || pass !== "") {
          const encoded = toBase64(`${user}:${pass}`);
          headers.push({
            key: "Authorization",
            value: `Basic ${encoded}`,
            enabled: true
          });
        }
        break;
      }
      case "apiKey": {
        const rawKey = auth.apiKey?.key || "";
        const rawVal = auth.apiKey?.value || "";
        const key = resolveVariables(rawKey, vars).trim();
        const value = resolveVariables(rawVal, vars).trim();
        const addTo = auth.apiKey?.addTo || "header";
        if (key !== "") {
          if (addTo === "query") {
            params.push({
              key,
              value,
              enabled: true
            });
          } else {
            headers.push({
              key,
              value,
              enabled: true
            });
          }
        }
        break;
      }
    }
    return { headers, params };
  }

  // src/utils/resolveHierarchyVariables.ts
  function resolveHierarchyVariables(optionsOrCollVars, activeEnvVariables, pathFolders, activeEnvId) {
    let collVars;
    let envVars;
    let folders;
    let envId;
    if (optionsOrCollVars && !Array.isArray(optionsOrCollVars) && typeof optionsOrCollVars === "object") {
      const opts = optionsOrCollVars;
      collVars = opts.collectionVariables;
      envVars = opts.activeEnvVariables;
      folders = opts.pathFolders;
      envId = opts.activeEnvId;
    } else {
      collVars = optionsOrCollVars;
      envVars = activeEnvVariables;
      folders = pathFolders;
      envId = activeEnvId;
    }
    const map = new Map;
    if (collVars && Array.isArray(collVars)) {
      for (const v of collVars) {
        if (v && v.enabled && typeof v.key === "string" && v.key.trim() !== "") {
          map.set(v.key.trim(), v.value ?? "");
        }
      }
    }
    if (envId !== null && envVars) {
      if (envVars instanceof Map) {
        for (const [k, v] of envVars.entries()) {
          if (typeof k === "string" && k.trim() !== "") {
            map.set(k.trim(), v ?? "");
          }
        }
      } else if (Array.isArray(envVars)) {
        for (const v of envVars) {
          if (v && v.enabled && typeof v.key === "string" && v.key.trim() !== "") {
            map.set(v.key.trim(), v.value ?? "");
          }
        }
      }
    }
    if (folders && Array.isArray(folders)) {
      for (const folder of folders) {
        if (folder && folder.variables && Array.isArray(folder.variables)) {
          for (const v of folder.variables) {
            if (v && v.enabled && typeof v.key === "string" && v.key.trim() !== "") {
              map.set(v.key.trim(), v.value ?? "");
            }
          }
        }
      }
    }
    if (envId && folders && Array.isArray(folders)) {
      for (const folder of folders) {
        if (folder && folder.folder_envs && typeof folder.folder_envs === "object") {
          const specificVars = folder.folder_envs[envId];
          if (specificVars && Array.isArray(specificVars)) {
            for (const v of specificVars) {
              if (v && v.enabled && typeof v.key === "string" && v.key.trim() !== "") {
                map.set(v.key.trim(), v.value ?? "");
              }
            }
          }
        }
      }
    }
    return map;
  }

  // node_modules/jsonc-parser/lib/esm/impl/scanner.js
  function createScanner(text, ignoreTrivia = false) {
    const len = text.length;
    let pos = 0, value = "", tokenOffset = 0, token = 16, lineNumber = 0, lineStartOffset = 0, tokenLineStartOffset = 0, prevTokenLineStartOffset = 0, scanError = 0;
    function scanHexDigits(count, exact) {
      let digits = 0;
      let value = 0;
      while (digits < count || !exact) {
        let ch = text.charCodeAt(pos);
        if (ch >= 48 && ch <= 57) {
          value = value * 16 + ch - 48;
        } else if (ch >= 65 && ch <= 70) {
          value = value * 16 + ch - 65 + 10;
        } else if (ch >= 97 && ch <= 102) {
          value = value * 16 + ch - 97 + 10;
        } else {
          break;
        }
        pos++;
        digits++;
      }
      if (digits < count) {
        value = -1;
      }
      return value;
    }
    function setPosition(newPosition) {
      pos = newPosition;
      value = "";
      tokenOffset = 0;
      token = 16;
      scanError = 0;
    }
    function scanNumber() {
      let start = pos;
      if (text.charCodeAt(pos) === 48) {
        pos++;
      } else {
        pos++;
        while (pos < text.length && isDigit(text.charCodeAt(pos))) {
          pos++;
        }
      }
      if (pos < text.length && text.charCodeAt(pos) === 46) {
        pos++;
        if (pos < text.length && isDigit(text.charCodeAt(pos))) {
          pos++;
          while (pos < text.length && isDigit(text.charCodeAt(pos))) {
            pos++;
          }
        } else {
          scanError = 3;
          return text.substring(start, pos);
        }
      }
      let end = pos;
      if (pos < text.length && (text.charCodeAt(pos) === 69 || text.charCodeAt(pos) === 101)) {
        pos++;
        if (pos < text.length && text.charCodeAt(pos) === 43 || text.charCodeAt(pos) === 45) {
          pos++;
        }
        if (pos < text.length && isDigit(text.charCodeAt(pos))) {
          pos++;
          while (pos < text.length && isDigit(text.charCodeAt(pos))) {
            pos++;
          }
          end = pos;
        } else {
          scanError = 3;
        }
      }
      return text.substring(start, end);
    }
    function scanString() {
      let result = "", start = pos;
      while (true) {
        if (pos >= len) {
          result += text.substring(start, pos);
          scanError = 2;
          break;
        }
        const ch = text.charCodeAt(pos);
        if (ch === 34) {
          result += text.substring(start, pos);
          pos++;
          break;
        }
        if (ch === 92) {
          result += text.substring(start, pos);
          pos++;
          if (pos >= len) {
            scanError = 2;
            break;
          }
          const ch2 = text.charCodeAt(pos++);
          switch (ch2) {
            case 34:
              result += '"';
              break;
            case 92:
              result += "\\";
              break;
            case 47:
              result += "/";
              break;
            case 98:
              result += "\b";
              break;
            case 102:
              result += "\f";
              break;
            case 110:
              result += `
`;
              break;
            case 114:
              result += "\r";
              break;
            case 116:
              result += "\t";
              break;
            case 117:
              const ch3 = scanHexDigits(4, true);
              if (ch3 >= 0) {
                result += String.fromCharCode(ch3);
              } else {
                scanError = 4;
              }
              break;
            default:
              scanError = 5;
          }
          start = pos;
          continue;
        }
        if (ch >= 0 && ch <= 31) {
          if (isLineBreak(ch)) {
            result += text.substring(start, pos);
            scanError = 2;
            break;
          } else {
            scanError = 6;
          }
        }
        pos++;
      }
      return result;
    }
    function scanNext() {
      value = "";
      scanError = 0;
      tokenOffset = pos;
      lineStartOffset = lineNumber;
      prevTokenLineStartOffset = tokenLineStartOffset;
      if (pos >= len) {
        tokenOffset = len;
        return token = 17;
      }
      let code = text.charCodeAt(pos);
      if (isWhiteSpace(code)) {
        do {
          pos++;
          value += String.fromCharCode(code);
          code = text.charCodeAt(pos);
        } while (isWhiteSpace(code));
        return token = 15;
      }
      if (isLineBreak(code)) {
        pos++;
        value += String.fromCharCode(code);
        if (code === 13 && text.charCodeAt(pos) === 10) {
          pos++;
          value += `
`;
        }
        lineNumber++;
        tokenLineStartOffset = pos;
        return token = 14;
      }
      switch (code) {
        case 123:
          pos++;
          return token = 1;
        case 125:
          pos++;
          return token = 2;
        case 91:
          pos++;
          return token = 3;
        case 93:
          pos++;
          return token = 4;
        case 58:
          pos++;
          return token = 6;
        case 44:
          pos++;
          return token = 5;
        case 34:
          pos++;
          value = scanString();
          return token = 10;
        case 47:
          const start = pos - 1;
          if (text.charCodeAt(pos + 1) === 47) {
            pos += 2;
            while (pos < len) {
              if (isLineBreak(text.charCodeAt(pos))) {
                break;
              }
              pos++;
            }
            value = text.substring(start, pos);
            return token = 12;
          }
          if (text.charCodeAt(pos + 1) === 42) {
            pos += 2;
            const safeLength = len - 1;
            let commentClosed = false;
            while (pos < safeLength) {
              const ch = text.charCodeAt(pos);
              if (ch === 42 && text.charCodeAt(pos + 1) === 47) {
                pos += 2;
                commentClosed = true;
                break;
              }
              pos++;
              if (isLineBreak(ch)) {
                if (ch === 13 && text.charCodeAt(pos) === 10) {
                  pos++;
                }
                lineNumber++;
                tokenLineStartOffset = pos;
              }
            }
            if (!commentClosed) {
              pos++;
              scanError = 1;
            }
            value = text.substring(start, pos);
            return token = 13;
          }
          value += String.fromCharCode(code);
          pos++;
          return token = 16;
        case 45:
          value += String.fromCharCode(code);
          pos++;
          if (pos === len || !isDigit(text.charCodeAt(pos))) {
            return token = 16;
          }
        case 48:
        case 49:
        case 50:
        case 51:
        case 52:
        case 53:
        case 54:
        case 55:
        case 56:
        case 57:
          value += scanNumber();
          return token = 11;
        default:
          while (pos < len && isUnknownContentCharacter(code)) {
            pos++;
            code = text.charCodeAt(pos);
          }
          if (tokenOffset !== pos) {
            value = text.substring(tokenOffset, pos);
            switch (value) {
              case "true":
                return token = 8;
              case "false":
                return token = 9;
              case "null":
                return token = 7;
            }
            return token = 16;
          }
          value += String.fromCharCode(code);
          pos++;
          return token = 16;
      }
    }
    function isUnknownContentCharacter(code) {
      if (isWhiteSpace(code) || isLineBreak(code)) {
        return false;
      }
      switch (code) {
        case 125:
        case 93:
        case 123:
        case 91:
        case 34:
        case 58:
        case 44:
        case 47:
          return false;
      }
      return true;
    }
    function scanNextNonTrivia() {
      let result;
      do {
        result = scanNext();
      } while (result >= 12 && result <= 15);
      return result;
    }
    return {
      setPosition,
      getPosition: () => pos,
      scan: ignoreTrivia ? scanNextNonTrivia : scanNext,
      getToken: () => token,
      getTokenValue: () => value,
      getTokenOffset: () => tokenOffset,
      getTokenLength: () => pos - tokenOffset,
      getTokenStartLine: () => lineStartOffset,
      getTokenStartCharacter: () => tokenOffset - prevTokenLineStartOffset,
      getTokenError: () => scanError
    };
  }
  function isWhiteSpace(ch) {
    return ch === 32 || ch === 9;
  }
  function isLineBreak(ch) {
    return ch === 10 || ch === 13;
  }
  function isDigit(ch) {
    return ch >= 48 && ch <= 57;
  }
  var CharacterCodes;
  (function(CharacterCodes) {
    CharacterCodes[CharacterCodes["lineFeed"] = 10] = "lineFeed";
    CharacterCodes[CharacterCodes["carriageReturn"] = 13] = "carriageReturn";
    CharacterCodes[CharacterCodes["space"] = 32] = "space";
    CharacterCodes[CharacterCodes["_0"] = 48] = "_0";
    CharacterCodes[CharacterCodes["_1"] = 49] = "_1";
    CharacterCodes[CharacterCodes["_2"] = 50] = "_2";
    CharacterCodes[CharacterCodes["_3"] = 51] = "_3";
    CharacterCodes[CharacterCodes["_4"] = 52] = "_4";
    CharacterCodes[CharacterCodes["_5"] = 53] = "_5";
    CharacterCodes[CharacterCodes["_6"] = 54] = "_6";
    CharacterCodes[CharacterCodes["_7"] = 55] = "_7";
    CharacterCodes[CharacterCodes["_8"] = 56] = "_8";
    CharacterCodes[CharacterCodes["_9"] = 57] = "_9";
    CharacterCodes[CharacterCodes["a"] = 97] = "a";
    CharacterCodes[CharacterCodes["b"] = 98] = "b";
    CharacterCodes[CharacterCodes["c"] = 99] = "c";
    CharacterCodes[CharacterCodes["d"] = 100] = "d";
    CharacterCodes[CharacterCodes["e"] = 101] = "e";
    CharacterCodes[CharacterCodes["f"] = 102] = "f";
    CharacterCodes[CharacterCodes["g"] = 103] = "g";
    CharacterCodes[CharacterCodes["h"] = 104] = "h";
    CharacterCodes[CharacterCodes["i"] = 105] = "i";
    CharacterCodes[CharacterCodes["j"] = 106] = "j";
    CharacterCodes[CharacterCodes["k"] = 107] = "k";
    CharacterCodes[CharacterCodes["l"] = 108] = "l";
    CharacterCodes[CharacterCodes["m"] = 109] = "m";
    CharacterCodes[CharacterCodes["n"] = 110] = "n";
    CharacterCodes[CharacterCodes["o"] = 111] = "o";
    CharacterCodes[CharacterCodes["p"] = 112] = "p";
    CharacterCodes[CharacterCodes["q"] = 113] = "q";
    CharacterCodes[CharacterCodes["r"] = 114] = "r";
    CharacterCodes[CharacterCodes["s"] = 115] = "s";
    CharacterCodes[CharacterCodes["t"] = 116] = "t";
    CharacterCodes[CharacterCodes["u"] = 117] = "u";
    CharacterCodes[CharacterCodes["v"] = 118] = "v";
    CharacterCodes[CharacterCodes["w"] = 119] = "w";
    CharacterCodes[CharacterCodes["x"] = 120] = "x";
    CharacterCodes[CharacterCodes["y"] = 121] = "y";
    CharacterCodes[CharacterCodes["z"] = 122] = "z";
    CharacterCodes[CharacterCodes["A"] = 65] = "A";
    CharacterCodes[CharacterCodes["B"] = 66] = "B";
    CharacterCodes[CharacterCodes["C"] = 67] = "C";
    CharacterCodes[CharacterCodes["D"] = 68] = "D";
    CharacterCodes[CharacterCodes["E"] = 69] = "E";
    CharacterCodes[CharacterCodes["F"] = 70] = "F";
    CharacterCodes[CharacterCodes["G"] = 71] = "G";
    CharacterCodes[CharacterCodes["H"] = 72] = "H";
    CharacterCodes[CharacterCodes["I"] = 73] = "I";
    CharacterCodes[CharacterCodes["J"] = 74] = "J";
    CharacterCodes[CharacterCodes["K"] = 75] = "K";
    CharacterCodes[CharacterCodes["L"] = 76] = "L";
    CharacterCodes[CharacterCodes["M"] = 77] = "M";
    CharacterCodes[CharacterCodes["N"] = 78] = "N";
    CharacterCodes[CharacterCodes["O"] = 79] = "O";
    CharacterCodes[CharacterCodes["P"] = 80] = "P";
    CharacterCodes[CharacterCodes["Q"] = 81] = "Q";
    CharacterCodes[CharacterCodes["R"] = 82] = "R";
    CharacterCodes[CharacterCodes["S"] = 83] = "S";
    CharacterCodes[CharacterCodes["T"] = 84] = "T";
    CharacterCodes[CharacterCodes["U"] = 85] = "U";
    CharacterCodes[CharacterCodes["V"] = 86] = "V";
    CharacterCodes[CharacterCodes["W"] = 87] = "W";
    CharacterCodes[CharacterCodes["X"] = 88] = "X";
    CharacterCodes[CharacterCodes["Y"] = 89] = "Y";
    CharacterCodes[CharacterCodes["Z"] = 90] = "Z";
    CharacterCodes[CharacterCodes["asterisk"] = 42] = "asterisk";
    CharacterCodes[CharacterCodes["backslash"] = 92] = "backslash";
    CharacterCodes[CharacterCodes["closeBrace"] = 125] = "closeBrace";
    CharacterCodes[CharacterCodes["closeBracket"] = 93] = "closeBracket";
    CharacterCodes[CharacterCodes["colon"] = 58] = "colon";
    CharacterCodes[CharacterCodes["comma"] = 44] = "comma";
    CharacterCodes[CharacterCodes["dot"] = 46] = "dot";
    CharacterCodes[CharacterCodes["doubleQuote"] = 34] = "doubleQuote";
    CharacterCodes[CharacterCodes["minus"] = 45] = "minus";
    CharacterCodes[CharacterCodes["openBrace"] = 123] = "openBrace";
    CharacterCodes[CharacterCodes["openBracket"] = 91] = "openBracket";
    CharacterCodes[CharacterCodes["plus"] = 43] = "plus";
    CharacterCodes[CharacterCodes["slash"] = 47] = "slash";
    CharacterCodes[CharacterCodes["formFeed"] = 12] = "formFeed";
    CharacterCodes[CharacterCodes["tab"] = 9] = "tab";
  })(CharacterCodes || (CharacterCodes = {}));

  // node_modules/jsonc-parser/lib/esm/impl/string-intern.js
  var cachedSpaces = new Array(20).fill(0).map((_, index) => {
    return " ".repeat(index);
  });
  var maxCachedValues = 200;
  var cachedBreakLinesWithSpaces = {
    " ": {
      "\n": new Array(maxCachedValues).fill(0).map((_, index) => {
        return `
` + " ".repeat(index);
      }),
      "\r": new Array(maxCachedValues).fill(0).map((_, index) => {
        return "\r" + " ".repeat(index);
      }),
      "\r\n": new Array(maxCachedValues).fill(0).map((_, index) => {
        return `\r
` + " ".repeat(index);
      })
    },
    "\t": {
      "\n": new Array(maxCachedValues).fill(0).map((_, index) => {
        return `
` + "\t".repeat(index);
      }),
      "\r": new Array(maxCachedValues).fill(0).map((_, index) => {
        return "\r" + "\t".repeat(index);
      }),
      "\r\n": new Array(maxCachedValues).fill(0).map((_, index) => {
        return `\r
` + "\t".repeat(index);
      })
    }
  };

  // node_modules/jsonc-parser/lib/esm/impl/parser.js
  var ParseOptions;
  (function(ParseOptions) {
    ParseOptions.DEFAULT = {
      allowTrailingComma: false
    };
  })(ParseOptions || (ParseOptions = {}));
  function stripComments(text, replaceCh) {
    let _scanner = createScanner(text), parts = [], kind, offset = 0, pos;
    do {
      pos = _scanner.getPosition();
      kind = _scanner.scan();
      switch (kind) {
        case 12:
        case 13:
        case 17:
          if (offset !== pos) {
            parts.push(text.substring(offset, pos));
          }
          if (replaceCh !== undefined) {
            parts.push(_scanner.getTokenValue().replace(/[^\r\n]/g, replaceCh));
          }
          offset = _scanner.getPosition();
          break;
      }
    } while (kind !== 17);
    return parts.join("");
  }

  // node_modules/jsonc-parser/lib/esm/main.js
  var ScanError;
  (function(ScanError) {
    ScanError[ScanError["None"] = 0] = "None";
    ScanError[ScanError["UnexpectedEndOfComment"] = 1] = "UnexpectedEndOfComment";
    ScanError[ScanError["UnexpectedEndOfString"] = 2] = "UnexpectedEndOfString";
    ScanError[ScanError["UnexpectedEndOfNumber"] = 3] = "UnexpectedEndOfNumber";
    ScanError[ScanError["InvalidUnicode"] = 4] = "InvalidUnicode";
    ScanError[ScanError["InvalidEscapeCharacter"] = 5] = "InvalidEscapeCharacter";
    ScanError[ScanError["InvalidCharacter"] = 6] = "InvalidCharacter";
  })(ScanError || (ScanError = {}));
  var SyntaxKind;
  (function(SyntaxKind) {
    SyntaxKind[SyntaxKind["OpenBraceToken"] = 1] = "OpenBraceToken";
    SyntaxKind[SyntaxKind["CloseBraceToken"] = 2] = "CloseBraceToken";
    SyntaxKind[SyntaxKind["OpenBracketToken"] = 3] = "OpenBracketToken";
    SyntaxKind[SyntaxKind["CloseBracketToken"] = 4] = "CloseBracketToken";
    SyntaxKind[SyntaxKind["CommaToken"] = 5] = "CommaToken";
    SyntaxKind[SyntaxKind["ColonToken"] = 6] = "ColonToken";
    SyntaxKind[SyntaxKind["NullKeyword"] = 7] = "NullKeyword";
    SyntaxKind[SyntaxKind["TrueKeyword"] = 8] = "TrueKeyword";
    SyntaxKind[SyntaxKind["FalseKeyword"] = 9] = "FalseKeyword";
    SyntaxKind[SyntaxKind["StringLiteral"] = 10] = "StringLiteral";
    SyntaxKind[SyntaxKind["NumericLiteral"] = 11] = "NumericLiteral";
    SyntaxKind[SyntaxKind["LineCommentTrivia"] = 12] = "LineCommentTrivia";
    SyntaxKind[SyntaxKind["BlockCommentTrivia"] = 13] = "BlockCommentTrivia";
    SyntaxKind[SyntaxKind["LineBreakTrivia"] = 14] = "LineBreakTrivia";
    SyntaxKind[SyntaxKind["Trivia"] = 15] = "Trivia";
    SyntaxKind[SyntaxKind["Unknown"] = 16] = "Unknown";
    SyntaxKind[SyntaxKind["EOF"] = 17] = "EOF";
  })(SyntaxKind || (SyntaxKind = {}));
  var stripComments2 = stripComments;
  var ParseErrorCode;
  (function(ParseErrorCode) {
    ParseErrorCode[ParseErrorCode["InvalidSymbol"] = 1] = "InvalidSymbol";
    ParseErrorCode[ParseErrorCode["InvalidNumberFormat"] = 2] = "InvalidNumberFormat";
    ParseErrorCode[ParseErrorCode["PropertyNameExpected"] = 3] = "PropertyNameExpected";
    ParseErrorCode[ParseErrorCode["ValueExpected"] = 4] = "ValueExpected";
    ParseErrorCode[ParseErrorCode["ColonExpected"] = 5] = "ColonExpected";
    ParseErrorCode[ParseErrorCode["CommaExpected"] = 6] = "CommaExpected";
    ParseErrorCode[ParseErrorCode["CloseBraceExpected"] = 7] = "CloseBraceExpected";
    ParseErrorCode[ParseErrorCode["CloseBracketExpected"] = 8] = "CloseBracketExpected";
    ParseErrorCode[ParseErrorCode["EndOfFileExpected"] = 9] = "EndOfFileExpected";
    ParseErrorCode[ParseErrorCode["InvalidCommentToken"] = 10] = "InvalidCommentToken";
    ParseErrorCode[ParseErrorCode["UnexpectedEndOfComment"] = 11] = "UnexpectedEndOfComment";
    ParseErrorCode[ParseErrorCode["UnexpectedEndOfString"] = 12] = "UnexpectedEndOfString";
    ParseErrorCode[ParseErrorCode["UnexpectedEndOfNumber"] = 13] = "UnexpectedEndOfNumber";
    ParseErrorCode[ParseErrorCode["InvalidUnicode"] = 14] = "InvalidUnicode";
    ParseErrorCode[ParseErrorCode["InvalidEscapeCharacter"] = 15] = "InvalidEscapeCharacter";
    ParseErrorCode[ParseErrorCode["InvalidCharacter"] = 16] = "InvalidCharacter";
  })(ParseErrorCode || (ParseErrorCode = {}));

  // src/utils/jsonEditor.ts
  function stripJsoncToJson(content) {
    if (!content || content.trim() === "") {
      return content;
    }
    const withoutComments = stripComments2(content);
    const strings = [];
    let masked = "";
    let inString = false;
    let strStart = 0;
    let i = 0;
    const len = withoutComments.length;
    while (i < len) {
      const ch = withoutComments[i];
      if (inString) {
        if (ch === "\\" && i + 1 < len) {
          i += 2;
          continue;
        }
        if (ch === '"') {
          inString = false;
          const literal = withoutComments.slice(strStart, i + 1);
          const idx = strings.length;
          strings.push(literal);
          masked += `"__HECTO_STR_${idx}__"`;
          i++;
          continue;
        }
        i++;
        continue;
      }
      if (ch === '"') {
        inString = true;
        strStart = i;
        i++;
        continue;
      }
      masked += ch;
      i++;
    }
    if (inString) {
      masked += withoutComments.slice(strStart);
    }
    let strippedMasked = masked;
    while (/,(\s*[}\]])/.test(strippedMasked)) {
      strippedMasked = strippedMasked.replace(/,(\s*[}\]])/g, "$1");
    }
    return strippedMasked.replace(/"__HECTO_STR_(\d+)__"/g, (_, idxStr) => {
      const idx = Number(idxStr);
      return strings[idx] ?? _;
    });
  }

  // src/utils/buildExecuteRequest.ts
  var AUTO_EXEC_CONTENT_TYPES = {
    json: "application/json",
    xml: "application/xml",
    urlencoded: "application/x-www-form-urlencoded"
  };
  function buildExecuteRequest(req, vars = new Map, inheritedHeaders = [], pathNodes = [], authOptions) {
    const method = req.method || "GET";
    const { auth: effectiveAuth } = resolveEffectiveAuth(req.auth, pathNodes, {
      ...authOptions,
      requestAuthEnvs: authOptions?.requestAuthEnvs ?? req.auth_envs
    });
    const { headers: rawAuthHeaders, params: rawAuthParams } = getAuthArtifacts(effectiveAuth, vars);
    const authHeaders = rawAuthHeaders.map((h) => ({ ...h, _authResolved: true }));
    const authParams = rawAuthParams.map((p) => ({ ...p, _authResolved: true }));
    const baseHeaders = mergeHeaders(authHeaders, inheritedHeaders);
    const merged = mergeHeaders(req.headers || [], baseHeaders);
    const hasContentType = merged.some((h) => h.key.trim().toLowerCase() === "content-type");
    const userExplicitlyDisabled = req.headers?.some((h) => typeof h?.key === "string" && h.key.trim().toLowerCase() === "content-type" && !h.enabled);
    const autoCt = req.body?.type ? AUTO_EXEC_CONTENT_TYPES[req.body.type] : undefined;
    if (autoCt && !hasContentType && !userExplicitlyDisabled) {
      merged.unshift({
        key: "Content-Type",
        value: autoCt,
        enabled: true
      });
    }
    const headers = merged.filter((h) => h.enabled && h.key.trim() !== "").map((h) => ({
      key: h.key,
      value: h._authResolved ? h.value : resolveVariables(h.value, vars),
      enabled: h.enabled
    }));
    const reqParamKeys = new Set;
    const reqDisabledParamKeys = new Set;
    for (const p of req.params || []) {
      if (p && typeof p.key === "string" && p.key.trim() !== "") {
        const resolvedKey = resolveVariables(p.key, vars).trim();
        if (p.enabled) {
          reqParamKeys.add(resolvedKey);
        } else {
          reqDisabledParamKeys.add(resolvedKey.toLowerCase());
        }
      }
    }
    const activeAuthParams = authParams.filter((ap) => !reqParamKeys.has(ap.key) && !reqDisabledParamKeys.has(ap.key.toLowerCase()));
    const rawParams = [...activeAuthParams, ...req.params || []];
    const params = rawParams.filter((p) => p.enabled).map((p) => ({
      key: p._authResolved ? p.key : resolveVariables(p.key, vars),
      value: p._authResolved ? p.value : resolveVariables(p.value, vars),
      enabled: p.enabled
    })).filter((p) => p.key.trim() !== "");
    const resolvedPathParams = [];
    const seenPathKeys = new Set;
    const disabledPathKeys = new Set;
    for (const pp of req.path_params || []) {
      if (!pp || typeof pp.key !== "string" || pp.key.trim() === "")
        continue;
      const k = pp.key.trim();
      if (!pp.enabled) {
        disabledPathKeys.add(k);
        continue;
      }
      const rawVal = pp.value || "";
      const resolvedVal = rawVal !== "" ? resolveVariables(rawVal, vars) : vars.get(k) ?? "";
      if (resolvedVal !== "") {
        resolvedPathParams.push({ key: k, value: resolvedVal, enabled: true });
        seenPathKeys.add(k);
      }
    }
    for (const [k, v] of vars.entries()) {
      if (!seenPathKeys.has(k) && !disabledPathKeys.has(k) && v !== "") {
        resolvedPathParams.push({ key: k, value: v, enabled: true });
      }
    }
    const urlWithPathParams = resolvePathParamsInUrl(req.url || "", resolvedPathParams);
    let url = resolveVariables(urlWithPathParams, vars);
    if (params.length > 0) {
      const { params: existingUrlParams } = parseUrl(url);
      const existingCounts = new Map;
      for (const ep of existingUrlParams) {
        const k = JSON.stringify([ep.key, ep.value]);
        existingCounts.set(k, (existingCounts.get(k) || 0) + 1);
      }
      const paramsToAppend = [];
      for (const p of params) {
        const k = JSON.stringify([p.key, p.value]);
        const count = existingCounts.get(k) || 0;
        if (count > 0) {
          existingCounts.set(k, count - 1);
        } else {
          paramsToAppend.push(p);
        }
      }
      if (paramsToAppend.length > 0) {
        const queryString = paramsToAppend.map((p) => p.value === "" ? encodeQueryComponent(p.key) : `${encodeQueryComponent(p.key)}=${encodeQueryComponent(p.value)}`).join("&");
        const appendToUrl = (baseStr, queryStr) => {
          if (baseStr.endsWith("&")) {
            return baseStr + queryStr;
          }
          if (baseStr.endsWith("?") && baseStr.indexOf("?") === baseStr.length - 1) {
            return baseStr + queryStr;
          }
          return baseStr + (baseStr.includes("?") ? "&" : "?") + queryStr;
        };
        const [base, hash] = splitPreservingVars(url, "#", 2);
        if (hash !== undefined) {
          url = appendToUrl(base, queryString) + "#" + hash;
        } else {
          url = appendToUrl(url, queryString);
        }
      }
    }
    let bodyContent = "";
    const bodyType = req.body?.type || "none";
    if (bodyType === "json") {
      bodyContent = stripJsoncToJson(resolveVariables(stripJsoncToJson(req.body?.content || ""), vars));
    } else if (bodyType === "text" || bodyType === "xml") {
      bodyContent = resolveVariables(req.body?.content || "", vars);
    } else if (bodyType === "urlencoded") {
      if (Array.isArray(req.body?.urlencoded) && req.body.urlencoded.length > 0) {
        bodyContent = req.body.urlencoded.filter((item) => item && item.enabled && typeof item.key === "string" && item.key.trim() !== "").map((item) => {
          const k = encodeURIComponent(resolveVariables(item.key.trim(), vars));
          const v = encodeURIComponent(resolveVariables(item.value || "", vars));
          return `${k}=${v}`;
        }).join("&");
      } else if (req.body?.content) {
        bodyContent = resolveVariables(req.body.content, vars);
      }
    } else if (bodyType === "formdata") {
      const formData = (req.body?.form_data || []).filter((item) => item && item.enabled && typeof item.key === "string" && item.key.trim() !== "").map((item) => ({
        key: resolveVariables(item.key.trim(), vars),
        value: resolveVariables(item.value || "", vars),
        enabled: true
      }));
      return {
        method,
        url,
        headers,
        body: "",
        body_type: "formdata",
        form_data: formData
      };
    }
    return {
      method,
      url,
      headers,
      body: bodyContent
    };
  }

  // src/utils/scriptRunner.ts
  function formatLogArg(arg) {
    if (typeof arg === "string")
      return arg;
    if (arg === undefined)
      return "undefined";
    if (arg === null)
      return "null";
    if (typeof arg === "object") {
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    }
    return String(arg);
  }
  function toStringVal(value) {
    if (value === undefined || value === null)
      return "";
    if (typeof value === "object") {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    return String(value);
  }
  function normalizeAuthConfig(input) {
    if (!input) {
      return { type: "inherit" };
    }
    if (typeof input === "string") {
      const s = input.trim().toLowerCase();
      if (s === "inherit" || s === "none") {
        return { type: s };
      }
      return { type: "inherit" };
    }
    if (typeof input !== "object") {
      return { type: "inherit" };
    }
    const obj = input;
    const typeLower = String(obj.type || "").trim().toLowerCase();
    if (typeLower === "inherit" || typeLower === "none") {
      return { type: typeLower };
    }
    if (typeLower === "bearer" || obj.bearer || obj.token !== undefined) {
      const rawToken = obj.bearer?.token ?? obj.token ?? obj.value ?? "";
      return {
        type: "bearer",
        bearer: { token: toStringVal(rawToken) }
      };
    }
    if (typeLower === "basic" || obj.basic || obj.username !== undefined || obj.password !== undefined || obj.user !== undefined || obj.pass !== undefined) {
      const username = obj.basic?.username ?? obj.username ?? obj.user ?? "";
      const password = obj.basic?.password ?? obj.password ?? obj.pass ?? "";
      return {
        type: "basic",
        basic: {
          username: toStringVal(username),
          password: toStringVal(password)
        }
      };
    }
    if (typeLower === "apikey" || typeLower === "api_key" || typeLower === "api-key" || obj.apiKey || obj.key !== undefined || obj.name !== undefined) {
      const key = obj.apiKey?.key ?? obj.key ?? obj.name ?? "";
      const value = obj.apiKey?.value ?? obj.value ?? "";
      const addTo = obj.apiKey?.addTo ?? obj.addTo ?? "header";
      return {
        type: "apiKey",
        apiKey: {
          key: toStringVal(key),
          value: toStringVal(value),
          addTo: String(addTo).toLowerCase() === "query" ? "query" : "header"
        }
      };
    }
    if (obj.value !== undefined && !obj.type) {
      return {
        type: "bearer",
        bearer: { token: toStringVal(obj.value) }
      };
    }
    return { type: "inherit" };
  }
  function executeScript(code, context) {
    const logs = [];
    const logEntries = [];
    const testResults = [];
    const envUpdates = {};
    const scopedEnvUpdates = {
      collection: {},
      globalEnvs: {},
      folderGlobals: {},
      folderEnvs: []
    };
    const scopedAuthUpdates = {
      folderGlobals: {},
      folderEnvs: [],
      collectionEnvs: []
    };
    const requestMutations = {};
    if (!code || !code.trim()) {
      return {
        success: true,
        logs,
        logEntries,
        testResults,
        envUpdates,
        scopedEnvUpdates,
        scopedAuthUpdates,
        requestMutations
      };
    }
    let currentUrl = context.request?.url ?? "";
    let currentMethod = context.request?.method ?? "GET";
    let currentParams = Array.isArray(context.request?.params) ? context.request.params.map((p) => ({ ...p })) : reconcileParamsFromUrl(currentUrl, []);
    let currentPathParams = Array.isArray(context.request?.path_params) ? context.request.path_params.map((p) => ({ ...p })) : reconcilePathParamsFromUrl(currentUrl, []);
    let currentHeaders = Array.isArray(context.request?.headers) ? context.request.headers.map((h) => ({ ...h })) : [];
    let currentBodyType = context.request?.body?.type ?? "none";
    let currentBodyContent = context.request?.body?.content ?? "";
    const findFolder = (folderNameOrId) => {
      const ancestors = Array.isArray(context.pathFolders) ? context.pathFolders : [];
      const all = Array.isArray(context.allFolders) ? context.allFolders : ancestors;
      if (!folderNameOrId || !folderNameOrId.trim()) {
        return ancestors.length > 0 ? ancestors[ancestors.length - 1] : undefined;
      }
      const target = folderNameOrId.trim().toLowerCase();
      return ancestors.find((f) => f && (f.id?.toLowerCase() === target || f.name?.trim().toLowerCase() === target)) || all.find((f) => f && (f.id?.toLowerCase() === target || f.name?.trim().toLowerCase() === target));
    };
    const findEnv = (envNameOrId) => {
      const envs = Array.isArray(context.environments) ? context.environments : [];
      if (!envNameOrId || !envNameOrId.trim()) {
        if (!context.activeEnvId)
          return;
        return envs.find((e) => e && e.id === context.activeEnvId);
      }
      const target = envNameOrId.trim().toLowerCase();
      return envs.find((e) => e && (e.id?.toLowerCase() === target || e.name?.trim().toLowerCase() === target));
    };
    const getVar = (key, envNameOrId) => {
      const k = String(key ?? "").trim();
      if (!k)
        return;
      if (envNameOrId && envNameOrId.trim()) {
        const targetKey = envNameOrId.trim();
        if (scopedEnvUpdates.globalEnvs[targetKey] && k in scopedEnvUpdates.globalEnvs[targetKey]) {
          return scopedEnvUpdates.globalEnvs[targetKey][k] || undefined;
        }
        const envObj = findEnv(targetKey);
        const found = envObj?.variables?.find((v) => v && v.enabled !== false && v.key.trim() === k);
        return found?.value;
      }
      return context.variables.get(k);
    };
    const setVar = (keyOrObj, value, envNameOrId) => {
      if (typeof keyOrObj === "object" && keyOrObj !== null) {
        const targetEnv = typeof value === "string" ? value : envNameOrId;
        for (const [k, v] of Object.entries(keyOrObj)) {
          setVar(k, v, targetEnv);
        }
        return;
      }
      const k = String(keyOrObj ?? "").trim();
      if (!k)
        return;
      const strVal = toStringVal(value);
      if (envNameOrId && envNameOrId.trim()) {
        const targetEnvKey = envNameOrId.trim();
        if (!scopedEnvUpdates.globalEnvs[targetEnvKey]) {
          scopedEnvUpdates.globalEnvs[targetEnvKey] = {};
        }
        scopedEnvUpdates.globalEnvs[targetEnvKey][k] = strVal;
        const matchedEnv = findEnv(targetEnvKey);
        if (context.activeEnvId && matchedEnv?.id === context.activeEnvId) {
          context.variables.set(k, strVal);
        }
        return;
      }
      context.variables.set(k, strVal);
      envUpdates[k] = strVal;
    };
    const createEnvScope = (targetEnv) => ({
      get: (key) => getVar(key, targetEnv),
      set: (keyOrObj, value) => {
        setVar(keyOrObj, value, targetEnv);
      },
      unset: (key) => {
        unsetVar(key, targetEnv);
      },
      toObject: () => {
        if (!targetEnv || !targetEnv.trim()) {
          return Object.fromEntries(context.variables.entries());
        }
        const envObj = findEnv(targetEnv);
        const res = {};
        if (envObj?.variables) {
          for (const v of envObj.variables) {
            if (v && v.enabled !== false && v.key.trim()) {
              res[v.key.trim()] = v.value;
            }
          }
        }
        const updates = scopedEnvUpdates.globalEnvs[targetEnv.trim()];
        if (updates) {
          for (const [k, v] of Object.entries(updates)) {
            if (v === "") {
              delete res[k];
            } else {
              res[k] = v;
            }
          }
        }
        return res;
      },
      get name() {
        const env = findEnv(targetEnv);
        return env?.name ?? "";
      },
      get id() {
        const env = findEnv(targetEnv);
        return env?.id ?? "";
      },
      folder: (folderName) => ({
        get: (key) => folderEnvApi.get(key, folderName, targetEnv),
        set: (keyOrObj, value) => {
          folderEnvApi.set(keyOrObj, value, folderName, targetEnv);
        },
        unset: (key) => {
          folderEnvApi.unset(key, folderName, targetEnv);
        },
        auth: createFolderAuthEnvMethods(folderName, targetEnv)
      }),
      auth: {
        folder: (folderName) => createFolderAuthEnvMethods(folderName, targetEnv),
        get: (folderName) => createFolderAuthEnvMethods(folderName, targetEnv).get(),
        set: (auth, folderName) => createFolderAuthEnvMethods(folderName, targetEnv).set(auth),
        inherit: (folderName) => createFolderAuthEnvMethods(folderName, targetEnv).inherit(),
        none: (folderName) => createFolderAuthEnvMethods(folderName, targetEnv).none(),
        unset: (folderName) => createFolderAuthEnvMethods(folderName, targetEnv).unset(),
        clear: (folderName) => createFolderAuthEnvMethods(folderName, targetEnv).clear(),
        setBearer: (token, folderName) => createFolderAuthEnvMethods(folderName, targetEnv).setBearer(token),
        setBasic: (u, p, folderName) => createFolderAuthEnvMethods(folderName, targetEnv).setBasic(u, p),
        setApiKey: (k, v, addTo, folderName) => createFolderAuthEnvMethods(folderName, targetEnv).setApiKey(k, v, addTo)
      }
    });
    const unsetVar = (key, envNameOrId) => {
      const k = String(key ?? "").trim();
      if (!k)
        return;
      if (envNameOrId && envNameOrId.trim()) {
        const targetEnvKey = envNameOrId.trim();
        if (!scopedEnvUpdates.globalEnvs[targetEnvKey]) {
          scopedEnvUpdates.globalEnvs[targetEnvKey] = {};
        }
        scopedEnvUpdates.globalEnvs[targetEnvKey][k] = "";
        const matchedEnv = findEnv(targetEnvKey);
        if (context.activeEnvId && matchedEnv?.id === context.activeEnvId) {
          context.variables.delete(k);
        }
        return;
      }
      context.variables.delete(k);
      envUpdates[k] = "";
    };
    const isFolderInPath = (folderNameOrId) => {
      if (!folderNameOrId || !folderNameOrId.trim() || folderNameOrId.trim() === "__nearest__") {
        return true;
      }
      const target = folderNameOrId.trim().toLowerCase();
      const pathFolders = Array.isArray(context.pathFolders) ? context.pathFolders : [];
      return pathFolders.some((f) => f && (f.id?.toLowerCase() === target || f.name?.trim().toLowerCase() === target));
    };
    const resolveFolderEnvTargets = (folderNameOrId, envNameOrId) => {
      if (folderNameOrId && folderNameOrId.trim() && (!envNameOrId || !envNameOrId.trim())) {
        const candidate = folderNameOrId.trim();
        const matchedFolder = findFolder(candidate);
        const matchedEnv = findEnv(candidate);
        if (!matchedFolder && matchedEnv) {
          return { fKey: "__nearest__", eKey: candidate };
        }
      }
      return {
        fKey: folderNameOrId?.trim() || "__nearest__",
        eKey: envNameOrId?.trim() || "__active__"
      };
    };
    const collectionScopeApi = {
      get: (key) => {
        const k = String(key ?? "").trim();
        if (!k)
          return;
        if (k in scopedEnvUpdates.collection) {
          return scopedEnvUpdates.collection[k] || undefined;
        }
        const found = (context.collectionVariables || []).find((v) => v && v.enabled !== false && v.key.trim() === k);
        return found ? found.value : context.variables.get(k);
      },
      set: (keyOrObj, value) => {
        if (typeof keyOrObj === "object" && keyOrObj !== null) {
          for (const [k, v] of Object.entries(keyOrObj)) {
            collectionScopeApi.set(k, v);
          }
          return;
        }
        const k = String(keyOrObj ?? "").trim();
        if (!k)
          return;
        const strVal = toStringVal(value);
        scopedEnvUpdates.collection[k] = strVal;
        context.variables.set(k, strVal);
      },
      unset: (key) => {
        const k = String(key ?? "").trim();
        if (!k)
          return;
        scopedEnvUpdates.collection[k] = "";
        context.variables.delete(k);
      },
      toObject: () => {
        const out = {};
        for (const v of context.collectionVariables || []) {
          if (v && v.enabled !== false && v.key?.trim()) {
            out[v.key.trim()] = v.value ?? "";
          }
        }
        return { ...out, ...scopedEnvUpdates.collection };
      }
    };
    const folderVariablesApi = {
      get: (key, folderNameOrId) => {
        const k = String(key ?? "").trim();
        if (!k)
          return;
        const fKey = folderNameOrId?.trim() || "__nearest__";
        if (scopedEnvUpdates.folderGlobals[fKey] && k in scopedEnvUpdates.folderGlobals[fKey]) {
          return scopedEnvUpdates.folderGlobals[fKey][k] || undefined;
        }
        const folder = findFolder(folderNameOrId);
        const found = folder?.variables?.find((v) => v && v.enabled !== false && v.key.trim() === k);
        if (found)
          return found.value;
        return isFolderInPath(folderNameOrId) ? context.variables.get(k) : undefined;
      },
      set: (keyOrObj, value, folderNameOrId) => {
        if (typeof keyOrObj === "object" && keyOrObj !== null) {
          const folder = typeof value === "string" ? value : folderNameOrId;
          for (const [k, v] of Object.entries(keyOrObj)) {
            folderVariablesApi.set(k, v, folder);
          }
          return;
        }
        const k = String(keyOrObj ?? "").trim();
        if (!k)
          return;
        const strVal = toStringVal(value);
        const fKey = folderNameOrId?.trim() || "__nearest__";
        if (!scopedEnvUpdates.folderGlobals[fKey]) {
          scopedEnvUpdates.folderGlobals[fKey] = {};
        }
        scopedEnvUpdates.folderGlobals[fKey][k] = strVal;
        if (isFolderInPath(folderNameOrId)) {
          context.variables.set(k, strVal);
        }
      },
      unset: (key, folderNameOrId) => {
        const k = String(key ?? "").trim();
        if (!k)
          return;
        const fKey = folderNameOrId?.trim() || "__nearest__";
        if (!scopedEnvUpdates.folderGlobals[fKey]) {
          scopedEnvUpdates.folderGlobals[fKey] = {};
        }
        scopedEnvUpdates.folderGlobals[fKey][k] = "";
        if (isFolderInPath(folderNameOrId)) {
          context.variables.delete(k);
        }
      },
      env: (envNameOrId, folderNameOrId) => ({
        get: (key) => folderEnvApi.get(key, folderNameOrId, envNameOrId),
        set: (keyOrObj, value) => {
          if (typeof keyOrObj === "object" && keyOrObj !== null) {
            for (const [k, v] of Object.entries(keyOrObj)) {
              folderEnvApi.set(k, v, folderNameOrId, envNameOrId);
            }
          } else {
            folderEnvApi.set(String(keyOrObj), value, folderNameOrId, envNameOrId);
          }
        },
        unset: (key) => {
          folderEnvApi.unset(key, folderNameOrId, envNameOrId);
        }
      })
    };
    const folderEnvApi = {
      get: (key, folderNameOrId, envNameOrId) => {
        const k = String(key ?? "").trim();
        if (!k)
          return;
        const { fKey, eKey } = resolveFolderEnvTargets(folderNameOrId, envNameOrId);
        for (let i = scopedEnvUpdates.folderEnvs.length - 1;i >= 0; i--) {
          const item = scopedEnvUpdates.folderEnvs[i];
          if (item.folder === fKey && item.env === eKey && item.key === k) {
            return item.value || undefined;
          }
        }
        const folder = findFolder(fKey === "__nearest__" ? undefined : fKey);
        const envObj = findEnv(eKey === "__active__" ? undefined : eKey);
        const envId = envObj?.id || (eKey !== "__active__" ? eKey : context.activeEnvId);
        if (folder?.folder_envs && envId && Array.isArray(folder.folder_envs[envId])) {
          const found = folder.folder_envs[envId].find((v) => v && v.enabled !== false && v.key.trim() === k);
          if (found)
            return found.value;
        }
        return isFolderInPath(fKey) && (eKey === "__active__" || context.activeEnvId && envObj?.id === context.activeEnvId) ? context.variables.get(k) : undefined;
      },
      set: (keyOrObj, value, folderNameOrId, envNameOrId) => {
        if (typeof keyOrObj === "object" && keyOrObj !== null) {
          let targetFolder;
          let targetEnv;
          if (typeof value === "string") {
            targetFolder = value;
            targetEnv = typeof folderNameOrId === "string" ? folderNameOrId : envNameOrId;
          } else {
            targetFolder = folderNameOrId;
            targetEnv = envNameOrId;
          }
          for (const [k, v] of Object.entries(keyOrObj)) {
            folderEnvApi.set(k, v, targetFolder, targetEnv);
          }
          return;
        }
        const k = String(keyOrObj ?? "").trim();
        if (!k)
          return;
        const strVal = toStringVal(value);
        const { fKey, eKey } = resolveFolderEnvTargets(folderNameOrId, envNameOrId);
        scopedEnvUpdates.folderEnvs.push({
          folder: fKey,
          env: eKey,
          key: k,
          value: strVal
        });
        const envObj = findEnv(eKey === "__active__" ? undefined : eKey);
        const isEnvActive = eKey === "__active__" || Boolean(context.activeEnvId && envObj?.id === context.activeEnvId);
        if (isFolderInPath(fKey) && isEnvActive) {
          context.variables.set(k, strVal);
        }
      },
      unset: (key, folderNameOrId, envNameOrId) => {
        const k = String(key ?? "").trim();
        if (!k)
          return;
        const { fKey, eKey } = resolveFolderEnvTargets(folderNameOrId, envNameOrId);
        scopedEnvUpdates.folderEnvs.push({
          folder: fKey,
          env: eKey,
          key: k,
          value: ""
        });
        const envObj = findEnv(eKey === "__active__" ? undefined : eKey);
        const isEnvActive = eKey === "__active__" || Boolean(context.activeEnvId && envObj?.id === context.activeEnvId);
        if (isFolderInPath(fKey) && isEnvActive) {
          context.variables.delete(k);
        }
      }
    };
    const createFolderAuthEnvMethods = (targetFolder, targetEnv) => ({
      get: () => {
        const { fKey, eKey } = resolveFolderEnvTargets(targetFolder, targetEnv);
        for (let i = scopedAuthUpdates.folderEnvs.length - 1;i >= 0; i--) {
          const item = scopedAuthUpdates.folderEnvs[i];
          if (item.folder === fKey && item.env === eKey) {
            return JSON.parse(JSON.stringify(item.auth));
          }
        }
        const folder = findFolder(fKey === "__nearest__" ? undefined : fKey);
        const envObj = findEnv(eKey === "__active__" ? undefined : eKey);
        const envId = envObj?.id || (eKey !== "__active__" ? eKey : context.activeEnvId);
        if (folder?.auth_envs && envId && folder.auth_envs[envId]) {
          return JSON.parse(JSON.stringify(folder.auth_envs[envId]));
        }
        return;
      },
      set: (auth) => {
        const { fKey, eKey } = resolveFolderEnvTargets(targetFolder, targetEnv);
        scopedAuthUpdates.folderEnvs.push({
          folder: fKey,
          env: eKey,
          auth: normalizeAuthConfig(auth)
        });
      },
      setBearer: (token) => {
        const { fKey, eKey } = resolveFolderEnvTargets(targetFolder, targetEnv);
        scopedAuthUpdates.folderEnvs.push({
          folder: fKey,
          env: eKey,
          auth: { type: "bearer", bearer: { token: toStringVal(token) } }
        });
      },
      setBasic: (username, password) => {
        const { fKey, eKey } = resolveFolderEnvTargets(targetFolder, targetEnv);
        scopedAuthUpdates.folderEnvs.push({
          folder: fKey,
          env: eKey,
          auth: {
            type: "basic",
            basic: { username: toStringVal(username), password: toStringVal(password) }
          }
        });
      },
      setApiKey: (key, value, addTo = "header") => {
        const { fKey, eKey } = resolveFolderEnvTargets(targetFolder, targetEnv);
        scopedAuthUpdates.folderEnvs.push({
          folder: fKey,
          env: eKey,
          auth: {
            type: "apiKey",
            apiKey: { key: toStringVal(key), value: toStringVal(value), addTo }
          }
        });
      },
      inherit: () => {
        const { fKey, eKey } = resolveFolderEnvTargets(targetFolder, targetEnv);
        scopedAuthUpdates.folderEnvs.push({
          folder: fKey,
          env: eKey,
          auth: { type: "inherit" }
        });
      },
      none: () => {
        const { fKey, eKey } = resolveFolderEnvTargets(targetFolder, targetEnv);
        scopedAuthUpdates.folderEnvs.push({
          folder: fKey,
          env: eKey,
          auth: { type: "none" }
        });
      },
      unset: () => {
        const { fKey, eKey } = resolveFolderEnvTargets(targetFolder, targetEnv);
        scopedAuthUpdates.folderEnvs.push({
          folder: fKey,
          env: eKey,
          auth: { type: "inherit" }
        });
      },
      clear: () => {
        const { fKey, eKey } = resolveFolderEnvTargets(targetFolder, targetEnv);
        scopedAuthUpdates.folderEnvs.push({
          folder: fKey,
          env: eKey,
          auth: { type: "inherit" }
        });
      }
    });
    const folderAuthApi = {
      get: (folderNameOrId) => {
        const fKey = folderNameOrId?.trim() || "__nearest__";
        if (scopedAuthUpdates.folderGlobals[fKey]) {
          return JSON.parse(JSON.stringify(scopedAuthUpdates.folderGlobals[fKey]));
        }
        const folder = findFolder(folderNameOrId);
        return folder?.auth ? JSON.parse(JSON.stringify(folder.auth)) : undefined;
      },
      set: (arg1, arg2, arg3) => {
        let authInput;
        let targetFolder;
        let targetEnv;
        if (typeof arg1 === "string" && (typeof arg2 === "object" || arg2 === "inherit" || arg2 === "none")) {
          targetFolder = arg1;
          authInput = arg2;
          targetEnv = typeof arg3 === "string" ? arg3 : undefined;
        } else {
          authInput = arg1;
          targetFolder = typeof arg2 === "string" ? arg2 : undefined;
          targetEnv = typeof arg3 === "string" ? arg3 : undefined;
        }
        if (targetEnv && targetEnv.trim()) {
          createFolderAuthEnvMethods(targetFolder, targetEnv).set(authInput);
          return;
        }
        const fKey = targetFolder?.trim() || "__nearest__";
        scopedAuthUpdates.folderGlobals[fKey] = normalizeAuthConfig(authInput);
      },
      setBearer: (token, folderNameOrId, envNameOrId) => {
        if (envNameOrId && envNameOrId.trim()) {
          createFolderAuthEnvMethods(folderNameOrId, envNameOrId).setBearer(token);
          return;
        }
        const fKey = folderNameOrId?.trim() || "__nearest__";
        scopedAuthUpdates.folderGlobals[fKey] = {
          type: "bearer",
          bearer: { token: toStringVal(token) }
        };
      },
      setBasic: (username, password, folderNameOrId, envNameOrId) => {
        if (envNameOrId && envNameOrId.trim()) {
          createFolderAuthEnvMethods(folderNameOrId, envNameOrId).setBasic(username, password);
          return;
        }
        const fKey = folderNameOrId?.trim() || "__nearest__";
        scopedAuthUpdates.folderGlobals[fKey] = {
          type: "basic",
          basic: { username: toStringVal(username), password: toStringVal(password) }
        };
      },
      setApiKey: (key, value, addToOrFolder, folderNameOrId, envNameOrId) => {
        let addTo = "header";
        let folder = folderNameOrId;
        const env = envNameOrId;
        if (addToOrFolder === "header" || addToOrFolder === "query") {
          addTo = addToOrFolder;
        } else if (typeof addToOrFolder === "string" && !folderNameOrId) {
          folder = addToOrFolder;
        }
        if (env && env.trim()) {
          createFolderAuthEnvMethods(folder, env).setApiKey(key, value, addTo);
          return;
        }
        const fKey = folder?.trim() || "__nearest__";
        scopedAuthUpdates.folderGlobals[fKey] = {
          type: "apiKey",
          apiKey: { key: toStringVal(key), value: toStringVal(value), addTo }
        };
      },
      inherit: (folderNameOrId, envNameOrId) => {
        if (envNameOrId && envNameOrId.trim()) {
          createFolderAuthEnvMethods(folderNameOrId, envNameOrId).inherit();
          return;
        }
        const fKey = folderNameOrId?.trim() || "__nearest__";
        scopedAuthUpdates.folderGlobals[fKey] = { type: "inherit" };
      },
      none: (folderNameOrId, envNameOrId) => {
        if (envNameOrId && envNameOrId.trim()) {
          createFolderAuthEnvMethods(folderNameOrId, envNameOrId).none();
          return;
        }
        const fKey = folderNameOrId?.trim() || "__nearest__";
        scopedAuthUpdates.folderGlobals[fKey] = { type: "none" };
      },
      unset: (folderNameOrId, envNameOrId) => {
        if (envNameOrId && envNameOrId.trim()) {
          createFolderAuthEnvMethods(folderNameOrId, envNameOrId).unset();
          return;
        }
        const fKey = folderNameOrId?.trim() || "__nearest__";
        scopedAuthUpdates.folderGlobals[fKey] = { type: "inherit" };
      },
      clear: (folderNameOrId, envNameOrId) => {
        if (envNameOrId && envNameOrId.trim()) {
          createFolderAuthEnvMethods(folderNameOrId, envNameOrId).clear();
          return;
        }
        const fKey = folderNameOrId?.trim() || "__nearest__";
        scopedAuthUpdates.folderGlobals[fKey] = { type: "inherit" };
      },
      folder: (folderNameOrId) => ({
        get: () => folderAuthApi.get(folderNameOrId),
        set: (auth) => folderAuthApi.set(auth, folderNameOrId),
        inherit: () => folderAuthApi.inherit(folderNameOrId),
        none: () => folderAuthApi.none(folderNameOrId),
        unset: () => folderAuthApi.unset(folderNameOrId),
        clear: () => folderAuthApi.clear(folderNameOrId),
        setBearer: (token) => folderAuthApi.setBearer(token, folderNameOrId),
        setBasic: (u, p) => folderAuthApi.setBasic(u, p, folderNameOrId),
        setApiKey: (k, v, addTo) => folderAuthApi.setApiKey(k, v, addTo, folderNameOrId),
        env: (envNameOrId) => createFolderAuthEnvMethods(folderNameOrId, envNameOrId)
      }),
      env: (envNameOrId, folderNameOrId) => ({
        folder: (fName) => createFolderAuthEnvMethods(fName, envNameOrId),
        get: () => createFolderAuthEnvMethods(folderNameOrId, envNameOrId).get(),
        set: (auth) => createFolderAuthEnvMethods(folderNameOrId, envNameOrId).set(auth),
        inherit: () => createFolderAuthEnvMethods(folderNameOrId, envNameOrId).inherit(),
        none: () => createFolderAuthEnvMethods(folderNameOrId, envNameOrId).none(),
        unset: () => createFolderAuthEnvMethods(folderNameOrId, envNameOrId).unset(),
        clear: () => createFolderAuthEnvMethods(folderNameOrId, envNameOrId).clear(),
        setBearer: (token) => createFolderAuthEnvMethods(folderNameOrId, envNameOrId).setBearer(token),
        setBasic: (u, p) => createFolderAuthEnvMethods(folderNameOrId, envNameOrId).setBasic(u, p),
        setApiKey: (k, v, addTo) => createFolderAuthEnvMethods(folderNameOrId, envNameOrId).setApiKey(k, v, addTo)
      })
    };
    const createFolderScope = (folderName) => ({
      get: (key) => folderVariablesApi.get(key, folderName),
      set: (keyOrObj, value) => {
        folderVariablesApi.set(keyOrObj, value, folderName);
      },
      unset: (key) => {
        folderVariablesApi.unset(key, folderName);
      },
      env: (envName) => ({
        get: (key) => folderEnvApi.get(key, folderName, envName),
        set: (keyOrObj, value) => {
          folderEnvApi.set(keyOrObj, value, folderName, envName);
        },
        unset: (key) => {
          folderEnvApi.unset(key, folderName, envName);
        },
        auth: createFolderAuthEnvMethods(folderName, envName)
      }),
      auth: {
        get: () => folderAuthApi.get(folderName),
        set: (auth) => folderAuthApi.set(auth, folderName),
        inherit: () => folderAuthApi.inherit(folderName),
        none: () => folderAuthApi.none(folderName),
        unset: () => folderAuthApi.unset(folderName),
        clear: () => folderAuthApi.clear(folderName),
        setBearer: (token) => folderAuthApi.setBearer(token, folderName),
        setBasic: (u, p) => folderAuthApi.setBasic(u, p, folderName),
        setApiKey: (k, v, addTo) => folderAuthApi.setApiKey(k, v, addTo, folderName),
        env: (envName) => createFolderAuthEnvMethods(folderName, envName)
      }
    });
    const folderAuthEnvApi = {
      get: (folderNameOrId, envNameOrId) => createFolderAuthEnvMethods(folderNameOrId, envNameOrId).get(),
      set: (arg1, arg2, arg3) => {
        let authInput;
        let targetFolder;
        let targetEnv;
        if (typeof arg1 === "string" && (typeof arg2 === "object" || arg2 === "inherit" || arg2 === "none")) {
          targetFolder = arg1;
          authInput = arg2;
          targetEnv = typeof arg3 === "string" ? arg3 : undefined;
        } else {
          authInput = arg1;
          targetFolder = typeof arg2 === "string" ? arg2 : undefined;
          targetEnv = typeof arg3 === "string" ? arg3 : undefined;
        }
        createFolderAuthEnvMethods(targetFolder, targetEnv).set(authInput);
      },
      setBearer: (token, folderNameOrId, envNameOrId) => createFolderAuthEnvMethods(folderNameOrId, envNameOrId).setBearer(token),
      setBasic: (username, password, folderNameOrId, envNameOrId) => createFolderAuthEnvMethods(folderNameOrId, envNameOrId).setBasic(username, password),
      setApiKey: (key, value, addToOrFolder, folderNameOrId, envNameOrId) => {
        let addTo = "header";
        let folder = folderNameOrId;
        const env = envNameOrId;
        if (addToOrFolder === "header" || addToOrFolder === "query") {
          addTo = addToOrFolder;
        } else if (typeof addToOrFolder === "string" && !folderNameOrId) {
          folder = addToOrFolder;
        }
        createFolderAuthEnvMethods(folder, env).setApiKey(key, value, addTo);
      },
      inherit: (folderNameOrId, envNameOrId) => createFolderAuthEnvMethods(folderNameOrId, envNameOrId).inherit(),
      none: (folderNameOrId, envNameOrId) => createFolderAuthEnvMethods(folderNameOrId, envNameOrId).none(),
      unset: (folderNameOrId, envNameOrId) => createFolderAuthEnvMethods(folderNameOrId, envNameOrId).unset(),
      clear: (folderNameOrId, envNameOrId) => createFolderAuthEnvMethods(folderNameOrId, envNameOrId).clear()
    };
    const createCollectionAuthEnvMethods = (targetEnv) => ({
      get: () => {
        const eKey = targetEnv?.trim() || "__active__";
        if (scopedAuthUpdates.collectionEnvs) {
          for (let i = scopedAuthUpdates.collectionEnvs.length - 1;i >= 0; i--) {
            const item = scopedAuthUpdates.collectionEnvs[i];
            if (eKey === "__active__") {
              if (item.env === "__active__" || context.activeEnvId && item.env.toLowerCase() === context.activeEnvId.toLowerCase()) {
                return JSON.parse(JSON.stringify(item.auth));
              }
            } else {
              const lower = eKey.toLowerCase();
              if (item.env.trim().toLowerCase() === lower) {
                return JSON.parse(JSON.stringify(item.auth));
              }
            }
          }
        }
        const envObj = findEnv(eKey === "__active__" ? undefined : eKey);
        const envId = envObj?.id || (eKey !== "__active__" ? eKey : context.activeEnvId);
        if (envId && context.collectionAuthEnvs && context.collectionAuthEnvs[envId]) {
          return JSON.parse(JSON.stringify(context.collectionAuthEnvs[envId]));
        }
        return;
      },
      set: (auth) => {
        const envKey = targetEnv?.trim() || "__active__";
        if (!scopedAuthUpdates.collectionEnvs)
          scopedAuthUpdates.collectionEnvs = [];
        scopedAuthUpdates.collectionEnvs.push({
          env: envKey,
          auth: normalizeAuthConfig(auth)
        });
      },
      setBearer: (token) => {
        const envKey = targetEnv?.trim() || "__active__";
        if (!scopedAuthUpdates.collectionEnvs)
          scopedAuthUpdates.collectionEnvs = [];
        scopedAuthUpdates.collectionEnvs.push({
          env: envKey,
          auth: { type: "bearer", bearer: { token: toStringVal(token) } }
        });
      },
      setBasic: (username, password) => {
        const envKey = targetEnv?.trim() || "__active__";
        if (!scopedAuthUpdates.collectionEnvs)
          scopedAuthUpdates.collectionEnvs = [];
        scopedAuthUpdates.collectionEnvs.push({
          env: envKey,
          auth: { type: "basic", basic: { username: toStringVal(username), password: toStringVal(password) } }
        });
      },
      setApiKey: (key, value, addTo = "header") => {
        const envKey = targetEnv?.trim() || "__active__";
        if (!scopedAuthUpdates.collectionEnvs)
          scopedAuthUpdates.collectionEnvs = [];
        scopedAuthUpdates.collectionEnvs.push({
          env: envKey,
          auth: { type: "apiKey", apiKey: { key: toStringVal(key), value: toStringVal(value), addTo } }
        });
      },
      inherit: () => {
        const envKey = targetEnv?.trim() || "__active__";
        if (!scopedAuthUpdates.collectionEnvs)
          scopedAuthUpdates.collectionEnvs = [];
        scopedAuthUpdates.collectionEnvs.push({
          env: envKey,
          auth: { type: "inherit" }
        });
      },
      none: () => {
        const envKey = targetEnv?.trim() || "__active__";
        if (!scopedAuthUpdates.collectionEnvs)
          scopedAuthUpdates.collectionEnvs = [];
        scopedAuthUpdates.collectionEnvs.push({
          env: envKey,
          auth: { type: "none" }
        });
      },
      unset: () => {
        const envKey = targetEnv?.trim() || "__active__";
        if (!scopedAuthUpdates.collectionEnvs)
          scopedAuthUpdates.collectionEnvs = [];
        scopedAuthUpdates.collectionEnvs.push({
          env: envKey,
          auth: { type: "inherit" }
        });
      },
      clear: () => {
        const envKey = targetEnv?.trim() || "__active__";
        if (!scopedAuthUpdates.collectionEnvs)
          scopedAuthUpdates.collectionEnvs = [];
        scopedAuthUpdates.collectionEnvs.push({
          env: envKey,
          auth: { type: "inherit" }
        });
      }
    });
    const collectionAuthApi = {
      get: (envNameOrId) => {
        if (envNameOrId && envNameOrId.trim()) {
          return createCollectionAuthEnvMethods(envNameOrId).get();
        }
        if (scopedAuthUpdates.collectionGlobal) {
          return JSON.parse(JSON.stringify(scopedAuthUpdates.collectionGlobal));
        }
        if (context.collectionAuth) {
          return JSON.parse(JSON.stringify(context.collectionAuth));
        }
        return;
      },
      set: (auth, envNameOrId) => {
        if (envNameOrId && envNameOrId.trim()) {
          createCollectionAuthEnvMethods(envNameOrId).set(auth);
          return;
        }
        scopedAuthUpdates.collectionGlobal = normalizeAuthConfig(auth);
      },
      setBearer: (token, envNameOrId) => {
        if (envNameOrId && envNameOrId.trim()) {
          createCollectionAuthEnvMethods(envNameOrId).setBearer(token);
          return;
        }
        scopedAuthUpdates.collectionGlobal = {
          type: "bearer",
          bearer: { token: toStringVal(token) }
        };
      },
      setBasic: (username, password, envNameOrId) => {
        if (envNameOrId && envNameOrId.trim()) {
          createCollectionAuthEnvMethods(envNameOrId).setBasic(username, password);
          return;
        }
        scopedAuthUpdates.collectionGlobal = {
          type: "basic",
          basic: { username: toStringVal(username), password: toStringVal(password) }
        };
      },
      setApiKey: (key, value, addTo = "header", envNameOrId) => {
        if (envNameOrId && envNameOrId.trim()) {
          createCollectionAuthEnvMethods(envNameOrId).setApiKey(key, value, addTo);
          return;
        }
        scopedAuthUpdates.collectionGlobal = {
          type: "apiKey",
          apiKey: { key: toStringVal(key), value: toStringVal(value), addTo }
        };
      },
      inherit: (envNameOrId) => {
        if (envNameOrId && envNameOrId.trim()) {
          createCollectionAuthEnvMethods(envNameOrId).inherit();
          return;
        }
        scopedAuthUpdates.collectionGlobal = { type: "inherit" };
      },
      none: (envNameOrId) => {
        if (envNameOrId && envNameOrId.trim()) {
          createCollectionAuthEnvMethods(envNameOrId).none();
          return;
        }
        scopedAuthUpdates.collectionGlobal = { type: "none" };
      },
      unset: (envNameOrId) => {
        if (envNameOrId && envNameOrId.trim()) {
          createCollectionAuthEnvMethods(envNameOrId).unset();
          return;
        }
        scopedAuthUpdates.collectionGlobal = { type: "inherit" };
      },
      clear: (envNameOrId) => {
        if (envNameOrId && envNameOrId.trim()) {
          createCollectionAuthEnvMethods(envNameOrId).clear();
          return;
        }
        scopedAuthUpdates.collectionGlobal = { type: "inherit" };
      },
      env: (envNameOrId) => createCollectionAuthEnvMethods(envNameOrId)
    };
    let currentAuth = context.request?.auth ? { ...context.request.auth } : undefined;
    const requestAuthApi = {
      get: () => {
        const target = requestMutations.auth ?? currentAuth;
        return target ? JSON.parse(JSON.stringify(target)) : undefined;
      },
      set: (auth) => {
        const normalized = normalizeAuthConfig(auth);
        currentAuth = normalized;
        requestMutations.auth = normalized;
      },
      setBearer: (token) => {
        const normalized = {
          type: "bearer",
          bearer: { token: toStringVal(token) }
        };
        currentAuth = normalized;
        requestMutations.auth = normalized;
      },
      setBasic: (username, password) => {
        const normalized = {
          type: "basic",
          basic: { username: toStringVal(username), password: toStringVal(password) }
        };
        currentAuth = normalized;
        requestMutations.auth = normalized;
      },
      setApiKey: (key, value, addTo = "header") => {
        const normalized = {
          type: "apiKey",
          apiKey: { key: toStringVal(key), value: toStringVal(value), addTo }
        };
        currentAuth = normalized;
        requestMutations.auth = normalized;
      },
      inherit: () => {
        const normalized = { type: "inherit" };
        currentAuth = normalized;
        requestMutations.auth = normalized;
      },
      none: () => {
        const normalized = { type: "none" };
        currentAuth = normalized;
        requestMutations.auth = normalized;
      },
      unset: () => {
        const normalized = { type: "inherit" };
        currentAuth = normalized;
        requestMutations.auth = normalized;
      },
      clear: () => {
        const normalized = { type: "inherit" };
        currentAuth = normalized;
        requestMutations.auth = normalized;
      }
    };
    const syncUrlFromParams = () => {
      currentUrl = updateUrlWithParams(currentUrl, currentParams);
      requestMutations.url = currentUrl;
      requestMutations.params = currentParams.map((p) => ({ ...p }));
    };
    const queryParamsApi = {
      get: (key) => {
        const k = String(key ?? "").trim();
        const found = currentParams.find((p) => p.enabled && p.key.trim() === k);
        return found?.value;
      },
      set: (key, value) => {
        const k = String(key ?? "").trim();
        if (!k)
          return;
        const strVal = toStringVal(value);
        const existing = currentParams.find((p) => p.key.trim() === k);
        if (existing) {
          existing.value = strVal;
          existing.enabled = true;
        } else {
          currentParams.push({ key: k, value: strVal, enabled: true });
        }
        syncUrlFromParams();
      },
      add: (key, value) => {
        const k = String(key ?? "").trim();
        if (!k)
          return;
        currentParams.push({ key: k, value: toStringVal(value), enabled: true });
        syncUrlFromParams();
      },
      remove: (key) => {
        const k = String(key ?? "").trim();
        currentParams = currentParams.filter((p) => p.key.trim() !== k);
        syncUrlFromParams();
      },
      unset: (key) => {
        const k = String(key ?? "").trim();
        currentParams = currentParams.filter((p) => p.key.trim() !== k);
        syncUrlFromParams();
      },
      toObject: () => {
        const out = {};
        for (const p of currentParams) {
          if (p.enabled && p.key.trim()) {
            out[p.key.trim()] = p.value;
          }
        }
        return out;
      }
    };
    const pathParamsApi = {
      get: (key) => {
        const k = String(key ?? "").trim().replace(/^:/, "");
        const found = currentPathParams.find((p) => p.enabled && p.key.trim() === k);
        return found?.value ?? context.variables.get(k);
      },
      set: (key, value) => {
        const k = String(key ?? "").trim().replace(/^:/, "");
        if (!k)
          return;
        const strVal = toStringVal(value);
        const existing = currentPathParams.find((p) => p.key.trim() === k);
        if (existing) {
          existing.value = strVal;
          existing.enabled = true;
        } else {
          currentPathParams.push({ key: k, value: strVal, enabled: true });
        }
        requestMutations.path_params = currentPathParams.map((p) => ({ ...p }));
      },
      unset: (key) => {
        const k = String(key ?? "").trim().replace(/^:/, "");
        const existing = currentPathParams.find((p) => p.key.trim() === k);
        if (existing) {
          existing.value = "";
        }
        requestMutations.path_params = currentPathParams.map((p) => ({ ...p }));
      },
      toObject: () => {
        const out = {};
        for (const p of currentPathParams) {
          if (p.enabled && p.key.trim()) {
            out[p.key.trim()] = p.value;
          }
        }
        return out;
      }
    };
    const headersApi = {
      get: (key) => {
        const k = String(key ?? "").trim().toLowerCase();
        const found = currentHeaders.find((h) => h.enabled && h.key.trim().toLowerCase() === k);
        return found?.value;
      },
      set: (key, value) => {
        const k = String(key ?? "").trim();
        if (!k)
          return;
        const strVal = toStringVal(value);
        const lower = k.toLowerCase();
        const existing = currentHeaders.find((h) => h.key.trim().toLowerCase() === lower);
        if (existing) {
          existing.key = k;
          existing.value = strVal;
          existing.enabled = true;
          delete existing._isAuto;
        } else {
          currentHeaders.push({ key: k, value: strVal, enabled: true });
        }
        requestMutations.headers = currentHeaders.map((h) => ({ ...h }));
      },
      add: (key, value) => {
        const k = String(key ?? "").trim();
        if (!k)
          return;
        currentHeaders.push({ key: k, value: toStringVal(value), enabled: true });
        requestMutations.headers = currentHeaders.map((h) => ({ ...h }));
      },
      remove: (key) => {
        const lower = String(key ?? "").trim().toLowerCase();
        currentHeaders = currentHeaders.filter((h) => h.key.trim().toLowerCase() !== lower);
        requestMutations.headers = currentHeaders.map((h) => ({ ...h }));
      },
      unset: (key) => {
        const lower = String(key ?? "").trim().toLowerCase();
        currentHeaders = currentHeaders.filter((h) => h.key.trim().toLowerCase() !== lower);
        requestMutations.headers = currentHeaders.map((h) => ({ ...h }));
      },
      toObject: () => {
        const out = {};
        for (const h of currentHeaders) {
          if (h.enabled && h.key.trim()) {
            out[h.key.trim()] = h.value;
          }
        }
        return out;
      }
    };
    const bodyApi = {
      get raw() {
        return currentBodyContent;
      },
      set raw(val) {
        currentBodyContent = toStringVal(val);
        requestMutations.body = {
          type: currentBodyType === "none" ? "text" : currentBodyType,
          content: currentBodyContent
        };
      },
      get type() {
        return currentBodyType;
      },
      json: () => {
        return JSON.parse(currentBodyContent || "{}");
      },
      set: (value, type) => {
        if (typeof value === "object" && value !== null) {
          currentBodyContent = JSON.stringify(value, null, 2);
          currentBodyType = type || "json";
        } else {
          currentBodyContent = toStringVal(value);
          if (type) {
            currentBodyType = type;
          } else if (currentBodyType === "none") {
            currentBodyType = "text";
          }
        }
        requestMutations.body = {
          type: currentBodyType,
          content: currentBodyContent
        };
      }
    };
    const haRequest = {
      get url() {
        return currentUrl;
      },
      set url(val) {
        currentUrl = toStringVal(val);
        currentParams = reconcileParamsFromUrl(currentUrl, currentParams);
        currentPathParams = reconcilePathParamsFromUrl(currentUrl, currentPathParams);
        requestMutations.url = currentUrl;
        requestMutations.params = currentParams.map((p) => ({ ...p }));
        requestMutations.path_params = currentPathParams.map((p) => ({ ...p }));
      },
      get method() {
        return currentMethod;
      },
      set method(val) {
        currentMethod = toStringVal(val).trim().toUpperCase() || "GET";
        requestMutations.method = currentMethod;
      },
      params: queryParamsApi,
      query: queryParamsApi,
      pathParams: pathParamsApi,
      headers: headersApi,
      body: bodyApi,
      auth: requestAuthApi
    };
    const buildResponseHeadersProxy = (rawHeaders) => {
      const base = { ...rawHeaders };
      Object.defineProperty(base, "get", {
        enumerable: false,
        value: (headerName) => {
          const lower = String(headerName ?? "").trim().toLowerCase();
          for (const [k, vals] of Object.entries(rawHeaders)) {
            if (k.toLowerCase() === lower) {
              return Array.isArray(vals) ? vals[0] : String(vals);
            }
          }
          return;
        }
      });
      Object.defineProperty(base, "toObject", {
        enumerable: false,
        value: () => {
          const out = {};
          for (const [k, vals] of Object.entries(rawHeaders)) {
            out[k] = Array.isArray(vals) ? vals.join(", ") : String(vals);
          }
          return out;
        }
      });
      return base;
    };
    const haResponse = context.response ? {
      code: context.response.status_code,
      statusCode: context.response.status_code,
      status: context.response.status_text,
      responseTime: context.response.time_ms,
      responseSize: context.response.size_bytes,
      headers: buildResponseHeadersProxy(context.response.headers || {}),
      text: () => context.response?.body ?? "",
      json: () => {
        const raw = context.response?.body ?? "";
        return JSON.parse(raw);
      },
      get data() {
        const raw = context.response?.body ?? "";
        try {
          return JSON.parse(raw);
        } catch {
          return raw;
        }
      }
    } : undefined;
    const pushLog = (level, args) => {
      const msg = args.map(formatLogArg).join(" ");
      const formatted = level === "log" ? msg : `[${level.toUpperCase()}] ${msg}`;
      logs.push(formatted);
      logEntries.push({
        level,
        message: msg,
        timestamp: new Date().toISOString()
      });
    };
    const sandboxConsole = {
      log: (...args) => pushLog("log", args),
      debug: (...args) => pushLog("log", args),
      info: (...args) => pushLog("info", args),
      warn: (...args) => pushLog("warn", args),
      error: (...args) => pushLog("error", args),
      table: (...args) => pushLog("info", args)
    };
    const ha = {
      environment: {
        get: getVar,
        set: setVar,
        unset: unsetVar,
        env: (envNameOrId) => createEnvScope(envNameOrId),
        folder: (folderName) => createFolderScope(folderName),
        toObject: () => Object.fromEntries(context.variables.entries()),
        get name() {
          const env = findEnv();
          return env?.name ?? "";
        },
        get id() {
          return context.activeEnvId ?? "";
        },
        getName: () => {
          const env = findEnv();
          return env?.name ?? "";
        },
        getCurrent: () => {
          const env = findEnv();
          return env ? { id: env.id, name: env.name } : undefined;
        },
        getActive: () => {
          const env = findEnv();
          return env ? { id: env.id, name: env.name } : undefined;
        }
      },
      env: (envNameOrId) => createEnvScope(envNameOrId),
      folder: (folderName) => createFolderScope(folderName),
      globals: collectionScopeApi,
      collectionVariables: collectionScopeApi,
      folderVariables: folderVariablesApi,
      folderEnv: folderEnvApi,
      folderEnvVariables: folderEnvApi,
      folderAuth: folderAuthApi,
      folderAuthEnv: folderAuthEnvApi,
      collectionAuth: collectionAuthApi,
      auth: requestAuthApi,
      variables: {
        get: (key) => getVar(key),
        set: (key, value) => setVar(key, value),
        unset: (key) => unsetVar(key),
        toObject: () => Object.fromEntries(context.variables.entries())
      },
      request: haRequest,
      response: haResponse,
      log: (...args) => pushLog("log", args),
      test: (name, fn) => {
        try {
          fn();
          testResults.push({ name: String(name), passed: true });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          testResults.push({ name: String(name), passed: false, error: errMsg });
        }
      }
    };
    try {
      const runner = new Function("ha", "pm", "console", `"use strict";
${code}`);
      runner(ha, ha, sandboxConsole);
      return {
        success: true,
        logs,
        logEntries,
        testResults,
        envUpdates,
        scopedEnvUpdates,
        scopedAuthUpdates,
        requestMutations
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logs.push(`[ERROR] ${message}`);
      logEntries.push({
        level: "error",
        message,
        timestamp: new Date().toISOString()
      });
      return {
        success: false,
        logs,
        logEntries,
        testResults,
        envUpdates,
        scopedEnvUpdates,
        scopedAuthUpdates,
        requestMutations,
        error: message
      };
    }
  }

  // src/utils/curl.ts
  function isCurlCommand(text) {
    if (!text || typeof text !== "string")
      return false;
    const trimmed = text.trim();
    return /^curl(?:\s|\\)/i.test(trimmed);
  }
  function tokenizeShellCommand(input) {
    const normalized = input.replace(/\\[ \t]*\r?\n/g, " ");
    const tokens = [];
    let current = "";
    let hasToken = false;
    let i = 0;
    const len = normalized.length;
    while (i < len) {
      const ch = normalized[i];
      if (/\s/.test(ch)) {
        if (hasToken) {
          tokens.push(current);
          current = "";
          hasToken = false;
        }
        i++;
        continue;
      }
      if (ch === "$" && i + 1 < len && normalized[i + 1] === "'") {
        hasToken = true;
        i += 2;
        while (i < len && normalized[i] !== "'") {
          if (normalized[i] === "\\" && i + 1 < len) {
            i++;
            const esc = normalized[i];
            if (esc === "n")
              current += `
`;
            else if (esc === "r")
              current += "\r";
            else if (esc === "t")
              current += "\t";
            else if (esc === "'" || esc === "\\" || esc === '"')
              current += esc;
            else
              current += esc;
          } else {
            current += normalized[i];
          }
          i++;
        }
        if (i < len && normalized[i] === "'")
          i++;
        continue;
      }
      if (ch === "'") {
        hasToken = true;
        i++;
        while (i < len && normalized[i] !== "'") {
          current += normalized[i];
          i++;
        }
        if (i < len && normalized[i] === "'")
          i++;
        continue;
      }
      if (ch === '"') {
        hasToken = true;
        i++;
        while (i < len && normalized[i] !== '"') {
          if (normalized[i] === "\\" && i + 1 < len) {
            const next = normalized[i + 1];
            if (next === '"' || next === "\\" || next === "$" || next === "`") {
              current += next;
              i += 2;
              continue;
            }
            if (next === "n") {
              current += `
`;
              i += 2;
              continue;
            }
            if (next === "r") {
              current += "\r";
              i += 2;
              continue;
            }
            if (next === "t") {
              current += "\t";
              i += 2;
              continue;
            }
          }
          current += normalized[i];
          i++;
        }
        if (i < len && normalized[i] === '"')
          i++;
        continue;
      }
      if (ch === "\\" && i + 1 < len) {
        hasToken = true;
        current += normalized[i + 1];
        i += 2;
        continue;
      }
      hasToken = true;
      current += ch;
      i++;
    }
    if (hasToken) {
      tokens.push(current);
    }
    return tokens;
  }
  function safeDecodeParam(val) {
    try {
      return decodeURIComponent(val.replace(/\+/g, " "));
    } catch {
      return val;
    }
  }
  function extractQueryParamsFromUrl(rawUrl) {
    const qIndex = rawUrl.indexOf("?");
    if (qIndex === -1)
      return [];
    const hashIndex = rawUrl.indexOf("#", qIndex);
    const queryString = hashIndex === -1 ? rawUrl.slice(qIndex + 1) : rawUrl.slice(qIndex + 1, hashIndex);
    if (!queryString)
      return [];
    const pairs = [];
    for (const part of queryString.split("&")) {
      if (!part)
        continue;
      const eqIdx = part.indexOf("=");
      if (eqIdx === -1) {
        pairs.push({ key: safeDecodeParam(part), value: "", enabled: true });
      } else {
        const k = safeDecodeParam(part.slice(0, eqIdx));
        const v = safeDecodeParam(part.slice(eqIdx + 1));
        pairs.push({ key: k, value: v, enabled: true });
      }
    }
    return pairs;
  }
  var IGNORED_VALUE_FLAGS = new Set([
    "-o",
    "--output",
    "-D",
    "--dump-header",
    "-w",
    "--write-out",
    "-m",
    "--max-time",
    "--connect-timeout",
    "-x",
    "--proxy",
    "-E",
    "--cert",
    "--cacert",
    "--key"
  ]);
  function parseCurlCommand(text) {
    const tokens = tokenizeShellCommand(text.trim());
    if (tokens.length > 0 && /^curl$/i.test(tokens[0])) {
      tokens.shift();
    }
    let explicitMethod = null;
    let forceGet = false;
    let isHead = false;
    let url = "";
    const headers = [];
    const dataParts = [];
    const formDataParts = [];
    let usedDataUrlencode = false;
    let auth;
    const parseFormPart = (raw) => {
      const eqIdx = raw.indexOf("=");
      if (eqIdx === -1) {
        formDataParts.push({ key: raw.trim(), value: "", enabled: true });
      } else {
        formDataParts.push({
          key: raw.slice(0, eqIdx).trim(),
          value: raw.slice(eqIdx + 1),
          enabled: true
        });
      }
    };
    const parseHeaderLine = (headerStr) => {
      const colonIdx = headerStr.indexOf(":");
      if (colonIdx !== -1) {
        const key = headerStr.slice(0, colonIdx).trim();
        const value = headerStr.slice(colonIdx + 1).trim();
        if (key) {
          headers.push({ key, value, enabled: true });
        }
      } else if (headerStr.endsWith(";")) {
        const key = headerStr.slice(0, -1).trim();
        if (key) {
          headers.push({ key, value: "", enabled: true });
        }
      }
    };
    let i = 0;
    while (i < tokens.length) {
      const token = tokens[i];
      if (token === "-X" || token === "--request") {
        if (i + 1 < tokens.length) {
          explicitMethod = tokens[++i].trim().toUpperCase();
        }
        i++;
        continue;
      }
      if (token.startsWith("-X") && token.length > 2) {
        explicitMethod = token.slice(2).trim().toUpperCase();
        i++;
        continue;
      }
      if (token.startsWith("--request=")) {
        explicitMethod = token.slice("--request=".length).trim().toUpperCase();
        i++;
        continue;
      }
      if (token === "-H" || token === "--header") {
        if (i + 1 < tokens.length) {
          parseHeaderLine(tokens[++i]);
        }
        i++;
        continue;
      }
      if (token.startsWith("-H") && token.length > 2) {
        parseHeaderLine(token.slice(2));
        i++;
        continue;
      }
      if (token.startsWith("--header=")) {
        parseHeaderLine(token.slice("--header=".length));
        i++;
        continue;
      }
      if (token === "-F" || token === "--form" || token === "--form-string") {
        if (i + 1 < tokens.length) {
          parseFormPart(tokens[++i]);
        }
        i++;
        continue;
      }
      if (token.startsWith("-F") && token.length > 2 && !token.startsWith("--")) {
        parseFormPart(token.slice(2));
        i++;
        continue;
      }
      const formPrefixMatch = token.match(/^--(form|form-string)=(.*)$/s);
      if (formPrefixMatch) {
        parseFormPart(formPrefixMatch[2]);
        i++;
        continue;
      }
      if (token === "-d" || token === "--data" || token === "--data-raw" || token === "--data-binary" || token === "--data-ascii" || token === "--data-urlencode") {
        if (token === "--data-urlencode") {
          usedDataUrlencode = true;
        }
        if (i + 1 < tokens.length) {
          dataParts.push(tokens[++i]);
        }
        i++;
        continue;
      }
      if (token.startsWith("-d") && token.length > 2 && !token.startsWith("--")) {
        dataParts.push(token.slice(2));
        i++;
        continue;
      }
      const dataPrefixMatch = token.match(/^--(data|data-raw|data-binary|data-ascii|data-urlencode)=(.*)$/s);
      if (dataPrefixMatch) {
        if (dataPrefixMatch[1] === "data-urlencode") {
          usedDataUrlencode = true;
        }
        dataParts.push(dataPrefixMatch[2]);
        i++;
        continue;
      }
      if (token === "-u" || token === "--user") {
        if (i + 1 < tokens.length) {
          const creds = tokens[++i];
          const colonIdx = creds.indexOf(":");
          const username = colonIdx === -1 ? creds : creds.slice(0, colonIdx);
          const password = colonIdx === -1 ? "" : creds.slice(colonIdx + 1);
          auth = {
            type: "basic",
            basic: { username, password }
          };
        }
        i++;
        continue;
      }
      if (token.startsWith("-u") && token.length > 2 && !token.startsWith("--")) {
        const creds = token.slice(2);
        const colonIdx = creds.indexOf(":");
        const username = colonIdx === -1 ? creds : creds.slice(0, colonIdx);
        const password = colonIdx === -1 ? "" : creds.slice(colonIdx + 1);
        auth = {
          type: "basic",
          basic: { username, password }
        };
        i++;
        continue;
      }
      if (token.startsWith("--user=")) {
        const creds = token.slice("--user=".length);
        const colonIdx = creds.indexOf(":");
        const username = colonIdx === -1 ? creds : creds.slice(0, colonIdx);
        const password = colonIdx === -1 ? "" : creds.slice(colonIdx + 1);
        auth = {
          type: "basic",
          basic: { username, password }
        };
        i++;
        continue;
      }
      if (token === "-A" || token === "--user-agent") {
        if (i + 1 < tokens.length) {
          headers.push({ key: "User-Agent", value: tokens[++i], enabled: true });
        }
        i++;
        continue;
      }
      if (token === "-e" || token === "--referer") {
        if (i + 1 < tokens.length) {
          headers.push({ key: "Referer", value: tokens[++i], enabled: true });
        }
        i++;
        continue;
      }
      if (token === "-b" || token === "--cookie") {
        if (i + 1 < tokens.length) {
          headers.push({ key: "Cookie", value: tokens[++i], enabled: true });
        }
        i++;
        continue;
      }
      if (token === "--url") {
        if (i + 1 < tokens.length) {
          url = tokens[++i].trim();
        }
        i++;
        continue;
      }
      if (token.startsWith("--url=")) {
        url = token.slice("--url=".length).trim();
        i++;
        continue;
      }
      if (token === "-G" || token === "--get") {
        forceGet = true;
        i++;
        continue;
      }
      if (token === "-I" || token === "--head") {
        isHead = true;
        i++;
        continue;
      }
      if (IGNORED_VALUE_FLAGS.has(token)) {
        i += 2;
        continue;
      }
      if (token.startsWith("-")) {
        i++;
        continue;
      }
      if (!url || /^https?:\/\//i.test(token) || token.startsWith("{{")) {
        url = token.trim();
      }
      i++;
    }
    const hasData = dataParts.length > 0 || formDataParts.length > 0;
    const bodyContent = dataParts.join("&");
    if (forceGet && dataParts.length > 0 && url) {
      const sep = url.includes("?") ? "&" : "?";
      url = `${url}${sep}${bodyContent}`;
    }
    let method = "GET";
    if (explicitMethod) {
      method = explicitMethod;
    } else if (forceGet) {
      method = "GET";
    } else if (isHead) {
      method = "HEAD";
    } else if (hasData) {
      method = "POST";
    }
    let bodyType = "none";
    let finalBodyContent = "";
    let urlencodedPairs;
    if (formDataParts.length > 0 && !forceGet) {
      bodyType = "formdata";
    } else if (dataParts.length > 0 && !forceGet) {
      finalBodyContent = bodyContent;
      const contentTypeHeader = headers.find((h) => h.key.toLowerCase() === "content-type");
      const ctVal = contentTypeHeader ? contentTypeHeader.value.toLowerCase() : "";
      const isContentTypeJson = ctVal.includes("json");
      const isContentTypeXml = ctVal.includes("xml");
      const isContentTypeUrlencoded = ctVal.includes("x-www-form-urlencoded");
      const isContentTypeText = ctVal.includes("text/plain");
      const trimmedBody = finalBodyContent.trim();
      let looksLikeJson = false;
      if (trimmedBody.startsWith("{") && trimmedBody.endsWith("}") || trimmedBody.startsWith("[") && trimmedBody.endsWith("]")) {
        try {
          JSON.parse(trimmedBody);
          looksLikeJson = true;
        } catch {
          looksLikeJson = /\{\{[^{}]+\}\}/.test(trimmedBody);
        }
      }
      const looksLikeXml = /^<[a-zA-Z?_!][\s\S]*>$/.test(trimmedBody);
      if (isContentTypeUrlencoded || usedDataUrlencode) {
        bodyType = "urlencoded";
        urlencodedPairs = finalBodyContent.split("&").filter(Boolean).map((part) => {
          const eqIdx = part.indexOf("=");
          if (eqIdx === -1) {
            return { key: safeDecodeParam(part), value: "", enabled: true };
          }
          return {
            key: safeDecodeParam(part.slice(0, eqIdx)),
            value: safeDecodeParam(part.slice(eqIdx + 1)),
            enabled: true
          };
        });
      } else if (isContentTypeJson) {
        bodyType = "json";
      } else if (isContentTypeXml) {
        bodyType = "xml";
      } else if (isContentTypeText) {
        bodyType = "text";
      } else if (looksLikeJson) {
        bodyType = "json";
      } else if (looksLikeXml) {
        bodyType = "xml";
      } else {
        bodyType = "text";
      }
    }
    const params = extractQueryParamsFromUrl(url);
    const path_params = reconcilePathParamsFromUrl(url, []);
    return {
      method,
      url,
      params,
      ...path_params.length > 0 ? { path_params } : {},
      headers,
      body: {
        type: bodyType,
        content: finalBodyContent,
        ...formDataParts.length > 0 ? { form_data: formDataParts } : {},
        ...urlencodedPairs ? { urlencoded: urlencodedPairs } : {}
      },
      ...auth ? { auth } : {}
    };
  }
  function escapeShell(str) {
    return `'${str.replace(/'/g, "'\\''")}'`;
  }
  function extractVarsFromEnv(env) {
    const map = new Map;
    if (!env)
      return map;
    if (env instanceof Map) {
      for (const [k, v] of env.entries()) {
        if (k && k.trim()) {
          map.set(k.trim(), v || "");
        }
      }
    } else if ("variables" in env && Array.isArray(env.variables)) {
      for (const v of env.variables) {
        if (v && v.enabled !== false && v.key?.trim()) {
          map.set(v.key.trim(), v.value || "");
        }
      }
    } else if (typeof env === "object") {
      for (const [k, v] of Object.entries(env)) {
        if (typeof v === "string" && k.trim()) {
          map.set(k.trim(), v);
        }
      }
    }
    return map;
  }
  function generateCurlCommand(req, envOrOptions, extraInheritedHeaders, extraPathNodes) {
    let vars = new Map;
    let hasExplicitVars = false;
    let inheritedHeaders = extraInheritedHeaders ? [...extraInheritedHeaders] : [];
    let pathNodes = extraPathNodes ? [...extraPathNodes] : [];
    let multiline = false;
    let dataFlag = "--data-raw";
    let activeEnvId;
    let collection;
    if (envOrOptions) {
      if (envOrOptions instanceof Map) {
        vars = extractVarsFromEnv(envOrOptions);
      } else if ("environment" in envOrOptions || "vars" in envOrOptions || "inheritedHeaders" in envOrOptions || "pathNodes" in envOrOptions || "multiline" in envOrOptions || "dataFlag" in envOrOptions || "activeEnvId" in envOrOptions || "collection" in envOrOptions) {
        const opts = envOrOptions;
        if (opts.vars) {
          vars = new Map(opts.vars);
          hasExplicitVars = true;
        } else if (opts.environment) {
          vars = extractVarsFromEnv(opts.environment);
        }
        if (opts.inheritedHeaders)
          inheritedHeaders = [...opts.inheritedHeaders];
        if (opts.pathNodes)
          pathNodes = [...opts.pathNodes];
        if (opts.multiline !== undefined)
          multiline = opts.multiline;
        if (opts.dataFlag !== undefined)
          dataFlag = opts.dataFlag;
        if (opts.activeEnvId !== undefined)
          activeEnvId = opts.activeEnvId;
        if (opts.collection !== undefined)
          collection = opts.collection;
      } else if ("variables" in envOrOptions && Array.isArray(envOrOptions.variables)) {
        vars = extractVarsFromEnv(envOrOptions);
      } else if (typeof envOrOptions === "object") {
        vars = extractVarsFromEnv(envOrOptions);
      }
    }
    if (pathNodes.length > 0 && inheritedHeaders.length === 0) {
      inheritedHeaders = getInheritedHeaders(pathNodes);
    }
    if (!hasExplicitVars) {
      for (const node of pathNodes) {
        if (node.variables) {
          for (const v of node.variables) {
            if (v.enabled && typeof v.key === "string" && v.key.trim() !== "") {
              vars.set(v.key.trim(), v.value || "");
            }
          }
        }
      }
    }
    const execReq = buildExecuteRequest(req, vars, inheritedHeaders, pathNodes, {
      activeEnvId,
      requestAuthEnvs: req.auth_envs,
      collection
    });
    const parts = ["curl"];
    const method = (execReq.method || "GET").trim().toUpperCase();
    parts.push(`-X ${method}`);
    parts.push(escapeShell(execReq.url));
    for (const h of execReq.headers) {
      if (h.enabled && h.key && h.key.trim() !== "") {
        if (req.body?.type === "formdata" && h.key.trim().toLowerCase() === "content-type" && h.value.trim().toLowerCase() === "multipart/form-data") {
          continue;
        }
        parts.push(`-H ${escapeShell(`${h.key.trim()}: ${h.value || ""}`)}`);
      }
    }
    if (req.body?.type === "formdata" && execReq.form_data && execReq.form_data.length > 0) {
      for (const item of execReq.form_data) {
        if (item.enabled && item.key && item.key.trim() !== "") {
          parts.push(`-F ${escapeShell(`${item.key.trim()}=${item.value || ""}`)}`);
        }
      }
    } else if (execReq.body && (req.body?.type === "json" || req.body?.type === "text" || req.body?.type === "xml" || req.body?.type === "urlencoded")) {
      parts.push(`${dataFlag} ${escapeShell(execReq.body)}`);
    }
    if (multiline) {
      if (parts.length <= 2) {
        return parts.join(" ");
      }
      const firstLine = `${parts[0]} ${parts[1]}`;
      const rest = parts.slice(2);
      return `${firstLine} \\
  ${rest.join(" \\\n  ")}`;
    }
    return parts.join(" ");
  }

  // src/utils/flowRunner.ts
  function deepClone(val) {
    if (val === undefined || val === null)
      return val;
    return JSON.parse(JSON.stringify(val));
  }
  function upsertVariableKVPair(list, key, value) {
    const existing = list.find((item) => item && item.key === key);
    if (existing) {
      existing.value = value;
      existing.enabled = true;
    } else {
      list.push({ key, value, enabled: true });
    }
  }
  function resolveEnvIdInMemory(envSelector, activeEnvId, environments) {
    if (!envSelector || envSelector === "__active__") {
      return activeEnvId || null;
    }
    const trimmed = envSelector.trim();
    if (!trimmed)
      return activeEnvId || null;
    const lower = trimmed.toLowerCase();
    const matched = environments.find((e) => e && (e.id?.toLowerCase() === lower || e.name?.trim().toLowerCase() === lower));
    return matched ? matched.id : trimmed;
  }
  function normalizeSlashPath(raw) {
    return raw.split("/").map((seg) => seg.trim().toLowerCase()).filter(Boolean).join("/");
  }
  function resolveFolderIdInMemory(folderSelector, pathFolders, allFolders) {
    if (!folderSelector || folderSelector === "__nearest__") {
      return pathFolders.length > 0 ? pathFolders[pathFolders.length - 1].id || null : null;
    }
    const trimmed = folderSelector.trim();
    if (!trimmed || trimmed === "__nearest__") {
      return pathFolders.length > 0 ? pathFolders[pathFolders.length - 1].id || null : null;
    }
    const lower = trimmed.toLowerCase();
    const isSlashSelector = trimmed.includes("/");
    const normalizedTargetPath = isSlashSelector ? normalizeSlashPath(trimmed) : "";
    for (let i = pathFolders.length - 1;i >= 0; i--) {
      const f = pathFolders[i];
      if (!f)
        continue;
      if (f.id?.toLowerCase() === lower || f.name?.trim().toLowerCase() === lower) {
        return f.id || null;
      }
      if (isSlashSelector && normalizedTargetPath) {
        const cumulativePath = pathFolders.slice(0, i + 1).map((node) => (node?.name || "").trim().toLowerCase()).filter(Boolean).join("/");
        if (cumulativePath === normalizedTargetPath || cumulativePath.endsWith("/" + normalizedTargetPath)) {
          return f.id || null;
        }
      }
    }
    const inAll = allFolders.find((f) => f && (f.id?.toLowerCase() === lower || f.name?.trim().toLowerCase() === lower));
    if (inAll)
      return inAll.id || null;
    if (isSlashSelector && normalizedTargetPath) {
      const searchTree = (nodes, ancestors) => {
        for (const node of nodes) {
          if (!node)
            continue;
          const nodeName = (node.name || "").trim().toLowerCase();
          const nextAncestors = nodeName ? [...ancestors, nodeName] : ancestors;
          const fullSlash = nextAncestors.join("/");
          if (fullSlash === normalizedTargetPath || fullSlash.endsWith("/" + normalizedTargetPath)) {
            return node.id || null;
          }
          if (typeof node.path === "string" && node.path.trim() !== "") {
            const normNodePath = normalizeSlashPath(node.path.replace(/\\/g, "/"));
            if (normNodePath === normalizedTargetPath || normNodePath.endsWith("/" + normalizedTargetPath)) {
              return node.id || null;
            }
          }
          if (Array.isArray(node.children) && node.children.length > 0) {
            const found = searchTree(node.children, nextAncestors);
            if (found)
              return found;
          }
        }
        return null;
      };
      const matchedFromTree = searchTree(allFolders, []);
      if (matchedFromTree)
        return matchedFromTree;
    }
    return null;
  }
  function countStepsInNodes(nodes) {
    if (!Array.isArray(nodes) || nodes.length === 0)
      return 0;
    let total = 0;
    for (const node of nodes) {
      if (!node)
        continue;
      if (Array.isArray(node.steps)) {
        total += node.steps.length;
      }
      if (Array.isArray(node.branches)) {
        for (const branch of node.branches) {
          if (branch && Array.isArray(branch.nodes)) {
            total += countStepsInNodes(branch.nodes);
          }
        }
      }
    }
    return total;
  }
  function evaluateStepVerdict(input) {
    if (!input) {
      return { passed: true };
    }
    if (input.requestMissing === true) {
      return {
        passed: false,
        failureCategory: "deleted_request",
        failureReason: "Request gốc đã bị xóa khỏi Collection"
      };
    }
    const netErr = typeof input.networkError === "string" ? input.networkError.trim() : "";
    if (netErr !== "") {
      return {
        passed: false,
        failureCategory: "network_or_timeout",
        failureReason: netErr
      };
    }
    const scriptErr = typeof input.scriptError === "string" ? input.scriptError.trim() : "";
    if (scriptErr !== "") {
      return {
        passed: false,
        failureCategory: "script_error",
        failureReason: scriptErr
      };
    }
    const tests = Array.isArray(input.scriptTests) ? input.scriptTests.filter(Boolean) : [];
    const failedTests = tests.filter((t) => t.passed === false);
    if (failedTests.length > 0) {
      const firstFailed = failedTests[0];
      const detail = firstFailed.error ? `${firstFailed.name}: ${firstFailed.error}` : `Test thất bại: ${firstFailed.name || "assertion failed"}`;
      return {
        passed: false,
        failureCategory: "test_failed",
        failureReason: detail
      };
    }
    const statusCode = typeof input.statusCode === "number" ? input.statusCode : 0;
    if (tests.length === 0 && statusCode >= 400) {
      return {
        passed: false,
        failureCategory: "http_status",
        failureReason: `HTTP ${statusCode}`
      };
    }
    return { passed: true };
  }
  function toVariablesMap(variables) {
    if (!variables)
      return new Map;
    if (variables instanceof Map)
      return variables;
    return new Map(Object.entries(variables));
  }
  function extractJsonPathValue(rawBody, rawPath) {
    if (typeof rawBody !== "string" || rawBody.trim() === "") {
      return { exists: false, value: undefined };
    }
    const trimmedPath = (rawPath || "").trim();
    if (!trimmedPath) {
      return { exists: false, value: undefined };
    }
    let parsed;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return { exists: false, value: undefined };
    }
    let normalizedPath = trimmedPath;
    if (normalizedPath === "$") {
      const exists = parsed !== undefined;
      return { exists, value: exists ? parsed : undefined };
    }
    if (normalizedPath.startsWith("$.")) {
      normalizedPath = normalizedPath.slice(2);
    } else if (normalizedPath.startsWith("$[")) {
      normalizedPath = normalizedPath.slice(1);
    } else if (normalizedPath.startsWith(".")) {
      normalizedPath = normalizedPath.slice(1);
    }
    const tokens = [];
    let pos = 0;
    while (pos < normalizedPath.length) {
      if (normalizedPath[pos] === ".") {
        pos++;
        if (pos >= normalizedPath.length || normalizedPath[pos] === ".") {
          return { exists: false, value: undefined };
        }
        continue;
      }
      if (normalizedPath[pos] === "[") {
        const closeBracket = normalizedPath.indexOf("]", pos + 1);
        if (closeBracket === -1) {
          return { exists: false, value: undefined };
        }
        const rawInner = normalizedPath.slice(pos + 1, closeBracket).trim();
        if (!rawInner) {
          return { exists: false, value: undefined };
        }
        if (rawInner.startsWith('"') && rawInner.endsWith('"') && rawInner.length >= 2 || rawInner.startsWith("'") && rawInner.endsWith("'") && rawInner.length >= 2) {
          tokens.push({ type: "prop", key: rawInner.slice(1, -1) });
        } else if (/^-?\d+$/.test(rawInner)) {
          tokens.push({ type: "index", key: rawInner, index: Number(rawInner) });
        } else {
          tokens.push({ type: "prop", key: rawInner });
        }
        pos = closeBracket + 1;
        continue;
      }
      if (normalizedPath[pos] === "]") {
        return { exists: false, value: undefined };
      }
      let nextSep = pos;
      while (nextSep < normalizedPath.length && normalizedPath[nextSep] !== "." && normalizedPath[nextSep] !== "[" && normalizedPath[nextSep] !== "]") {
        nextSep++;
      }
      if (nextSep < normalizedPath.length && normalizedPath[nextSep] === "]") {
        return { exists: false, value: undefined };
      }
      const propName = normalizedPath.slice(pos, nextSep);
      if (!propName) {
        return { exists: false, value: undefined };
      }
      tokens.push({ type: "prop", key: propName });
      pos = nextSep;
    }
    if (tokens.length === 0) {
      return { exists: false, value: undefined };
    }
    let current = parsed;
    for (const token of tokens) {
      if (current === null || current === undefined || typeof current !== "object") {
        return { exists: false, value: undefined };
      }
      if (Array.isArray(current)) {
        const idx = token.type === "index" && token.index !== undefined ? token.index : /^-?\d+$/.test(token.key) ? Number(token.key) : NaN;
        if (!Number.isInteger(idx) || idx < 0 || idx >= current.length) {
          return { exists: false, value: undefined };
        }
        current = current[idx];
      } else {
        const obj = current;
        if (!Object.prototype.hasOwnProperty.call(obj, token.key)) {
          return { exists: false, value: undefined };
        }
        current = obj[token.key];
      }
    }
    if (current === undefined) {
      return { exists: false, value: undefined };
    }
    return { exists: true, value: current };
  }
  function parseFiniteNumber(val) {
    if (typeof val === "number") {
      return Number.isFinite(val) ? val : null;
    }
    if (typeof val === "string") {
      const trimmed = val.trim();
      if (trimmed === "")
        return null;
      const num = Number(trimmed);
      return Number.isFinite(num) ? num : null;
    }
    return null;
  }
  function isLosslessNumericString(raw) {
    const trimmed = raw.trim();
    if (trimmed === "")
      return false;
    const num = Number(trimmed);
    return Number.isFinite(num) && String(num) === trimmed;
  }
  function valuesAreEqual(actual, expected) {
    const expectedTrimmed = String(expected).trim();
    if (typeof actual === "number") {
      if (Number.isFinite(actual) && isLosslessNumericString(expectedTrimmed)) {
        return actual === Number(expectedTrimmed);
      }
      return String(actual) === String(expected);
    }
    if (typeof actual === "string") {
      const actualTrimmed = actual.trim();
      if (isLosslessNumericString(actualTrimmed) && isLosslessNumericString(expectedTrimmed)) {
        return Number(actualTrimmed) === Number(expectedTrimmed);
      }
      return actual === String(expected);
    }
    if (typeof actual === "object" && actual !== null) {
      try {
        return JSON.stringify(actual) === expected;
      } catch {
        return String(actual) === expected;
      }
    }
    return String(actual) === String(expected);
  }
  function evaluateCustomBranchCondition(condition, ctx) {
    if (!condition || !ctx)
      return false;
    const condType = (condition.type || "").trim().toLowerCase();
    if (condType !== "custom")
      return false;
    const source = (condition.source || condition.target || "").trim().toLowerCase();
    const operator = (condition.operator || "").trim().toLowerCase();
    const varsMap = toVariablesMap(ctx.variables);
    const resolvedExpected = resolveVariables(String(condition.value ?? ""), varsMap);
    let exists = false;
    let actualValue = undefined;
    if (source === "status_code") {
      const hasNetErr = typeof ctx.networkError === "string" && ctx.networkError.trim() !== "";
      if (!ctx.requestMissing && !hasNetErr && typeof ctx.statusCode === "number" && ctx.statusCode > 0) {
        exists = true;
        actualValue = ctx.statusCode;
      }
    } else if (source === "body_json") {
      const rawJsonPath = condition.path || condition.json_path || "";
      const jsonPath = resolveVariables(String(rawJsonPath), varsMap);
      const extracted = extractJsonPathValue(ctx.responseBody, jsonPath);
      exists = extracted.exists;
      actualValue = extracted.value;
      if (operator === "exists") {
        return extracted.exists && extracted.value !== null && extracted.value !== undefined;
      }
      if (operator === "==" && extracted.exists && extracted.value === null) {
        return resolvedExpected.trim().toLowerCase() === "null";
      }
      if (operator === "!=" && extracted.exists && extracted.value === null) {
        return resolvedExpected.trim().toLowerCase() !== "null";
      }
    } else if (source === "variable") {
      const rawVarName = (condition.path || condition.variable || condition.variable_name || "").trim();
      const varName = resolveVariables(String(rawVarName), varsMap).trim();
      if (varName !== "" && varsMap.has(varName)) {
        const val = varsMap.get(varName);
        if (val !== undefined && val !== null) {
          exists = true;
          actualValue = val;
        }
      }
    } else {
      return false;
    }
    if (operator === "exists") {
      return exists && actualValue !== undefined && actualValue !== null;
    }
    if (!exists || actualValue === undefined || actualValue === null) {
      return false;
    }
    switch (operator) {
      case "==":
        return valuesAreEqual(actualValue, resolvedExpected);
      case "!=":
        return !valuesAreEqual(actualValue, resolvedExpected);
      case ">": {
        const numActual = parseFiniteNumber(actualValue);
        const numExpected = parseFiniteNumber(resolvedExpected);
        if (numActual === null || numExpected === null)
          return false;
        return numActual > numExpected;
      }
      case "<": {
        const numActual = parseFiniteNumber(actualValue);
        const numExpected = parseFiniteNumber(resolvedExpected);
        if (numActual === null || numExpected === null)
          return false;
        return numActual < numExpected;
      }
      case ">=": {
        const numActual = parseFiniteNumber(actualValue);
        const numExpected = parseFiniteNumber(resolvedExpected);
        if (numActual === null || numExpected === null)
          return false;
        return numActual >= numExpected;
      }
      case "<=": {
        const numActual = parseFiniteNumber(actualValue);
        const numExpected = parseFiniteNumber(resolvedExpected);
        if (numActual === null || numExpected === null)
          return false;
        return numActual <= numExpected;
      }
      case "contains": {
        if (Array.isArray(actualValue)) {
          return actualValue.some((item) => item !== undefined && item !== null && valuesAreEqual(item, resolvedExpected));
        }
        if (typeof actualValue === "string" || typeof actualValue === "number" || typeof actualValue === "boolean") {
          return String(actualValue).includes(String(resolvedExpected));
        }
        return false;
      }
      case "matches": {
        try {
          const re = new RegExp(resolvedExpected);
          return re.test(String(actualValue));
        } catch {
          return false;
        }
      }
      default:
        return false;
    }
  }
  function selectMatchingBranch(branches, nodePassed, ctx) {
    if (!Array.isArray(branches) || branches.length === 0) {
      return { matchedBranchId: null, skippedBranchIds: [] };
    }
    let matchedIdx = -1;
    for (let i = 0;i < branches.length; i++) {
      const branch = branches[i];
      if (!branch || !branch.condition)
        continue;
      const condType = (branch.condition.type || "").trim().toLowerCase();
      if (condType === "custom") {
        if (evaluateCustomBranchCondition(branch.condition, ctx)) {
          matchedIdx = i;
          break;
        }
      }
    }
    if (matchedIdx === -1) {
      const fallbackType = nodePassed ? "success" : "error";
      for (let i = 0;i < branches.length; i++) {
        const branch = branches[i];
        if (!branch || !branch.condition)
          continue;
        const condType = (branch.condition.type || "").trim().toLowerCase();
        if (condType === fallbackType) {
          matchedIdx = i;
          break;
        }
      }
    }
    const matchedBranchId = matchedIdx >= 0 ? branches[matchedIdx].id : null;
    const skippedBranchIds = [];
    for (let i = 0;i < branches.length; i++) {
      if (i !== matchedIdx && branches[i] && branches[i].id) {
        skippedBranchIds.push(branches[i].id);
      }
    }
    return { matchedBranchId, skippedBranchIds };
  }
  function normalizeStepScriptResult(raw, stepPathFolders, allFolders, activeEnvId, environments) {
    const normalized = {
      success: raw.success !== false,
      logs: Array.isArray(raw.logs) ? [...raw.logs] : [],
      logEntries: Array.isArray(raw.logEntries) ? deepClone(raw.logEntries) : [],
      testResults: Array.isArray(raw.testResults) ? deepClone(raw.testResults) : [],
      envUpdates: raw.envUpdates ? { ...raw.envUpdates } : {},
      scopedEnvUpdates: {
        collection: raw.scopedEnvUpdates?.collection ? { ...raw.scopedEnvUpdates.collection } : {},
        globalEnvs: {},
        folderGlobals: {},
        folderEnvs: []
      },
      scopedAuthUpdates: {
        folderGlobals: {},
        folderEnvs: [],
        collectionGlobal: raw.scopedAuthUpdates?.collectionGlobal ? deepClone(raw.scopedAuthUpdates.collectionGlobal) : undefined,
        collectionEnvs: []
      },
      requestMutations: raw.requestMutations ? deepClone(raw.requestMutations) : {},
      error: raw.error
    };
    if (raw.scopedEnvUpdates?.globalEnvs) {
      for (const [envSel, kvMap] of Object.entries(raw.scopedEnvUpdates.globalEnvs)) {
        const resolvedEnv = resolveEnvIdInMemory(envSel, activeEnvId, environments) || envSel;
        if (!normalized.scopedEnvUpdates.globalEnvs[resolvedEnv]) {
          normalized.scopedEnvUpdates.globalEnvs[resolvedEnv] = {};
        }
        Object.assign(normalized.scopedEnvUpdates.globalEnvs[resolvedEnv], kvMap || {});
      }
    }
    if (raw.scopedEnvUpdates?.folderGlobals) {
      for (const [folderSel, kvMap] of Object.entries(raw.scopedEnvUpdates.folderGlobals)) {
        const fId = resolveFolderIdInMemory(folderSel, stepPathFolders, allFolders);
        if (!fId)
          continue;
        if (!normalized.scopedEnvUpdates.folderGlobals[fId]) {
          normalized.scopedEnvUpdates.folderGlobals[fId] = {};
        }
        Object.assign(normalized.scopedEnvUpdates.folderGlobals[fId], kvMap || {});
      }
    }
    if (Array.isArray(raw.scopedEnvUpdates?.folderEnvs)) {
      for (const item of raw.scopedEnvUpdates.folderEnvs) {
        if (!item)
          continue;
        const fId = resolveFolderIdInMemory(item.folder, stepPathFolders, allFolders);
        const eId = resolveEnvIdInMemory(item.env, activeEnvId, environments);
        if (!fId || !eId)
          continue;
        const existingIdx = normalized.scopedEnvUpdates.folderEnvs.findIndex((x) => x.folder === fId && x.env === eId && x.key === item.key);
        if (existingIdx >= 0) {
          normalized.scopedEnvUpdates.folderEnvs[existingIdx].value = item.value;
        } else {
          normalized.scopedEnvUpdates.folderEnvs.push({
            folder: fId,
            env: eId,
            key: item.key,
            value: item.value
          });
        }
      }
    }
    if (raw.scopedAuthUpdates?.collectionEnvs) {
      for (const item of raw.scopedAuthUpdates.collectionEnvs) {
        if (!item || !item.auth)
          continue;
        const eId = resolveEnvIdInMemory(item.env, activeEnvId, environments);
        if (!eId)
          continue;
        const existingIdx = normalized.scopedAuthUpdates.collectionEnvs.findIndex((x) => x.env === eId);
        if (existingIdx >= 0) {
          normalized.scopedAuthUpdates.collectionEnvs[existingIdx].auth = deepClone(item.auth);
        } else {
          normalized.scopedAuthUpdates.collectionEnvs.push({
            env: eId,
            auth: deepClone(item.auth)
          });
        }
      }
    }
    if (raw.scopedAuthUpdates?.folderGlobals) {
      for (const [folderSel, authCfg] of Object.entries(raw.scopedAuthUpdates.folderGlobals)) {
        if (!authCfg)
          continue;
        const fId = resolveFolderIdInMemory(folderSel, stepPathFolders, allFolders);
        if (!fId)
          continue;
        normalized.scopedAuthUpdates.folderGlobals[fId] = deepClone(authCfg);
      }
    }
    if (Array.isArray(raw.scopedAuthUpdates?.folderEnvs)) {
      for (const item of raw.scopedAuthUpdates.folderEnvs) {
        if (!item || !item.auth)
          continue;
        const fId = resolveFolderIdInMemory(item.folder, stepPathFolders, allFolders);
        const eId = resolveEnvIdInMemory(item.env, activeEnvId, environments);
        if (!fId || !eId)
          continue;
        const existingIdx = normalized.scopedAuthUpdates.folderEnvs.findIndex((x) => x.folder === fId && x.env === eId);
        if (existingIdx >= 0) {
          normalized.scopedAuthUpdates.folderEnvs[existingIdx].auth = deepClone(item.auth);
        } else {
          normalized.scopedAuthUpdates.folderEnvs.push({
            folder: fId,
            env: eId,
            auth: deepClone(item.auth)
          });
        }
      }
    }
    return normalized;
  }
  function applyNormalizedUpdatesToState(norm, collection, environments, activeEnvId, stepPathFolders, allFolders) {
    const syncFolderNodes = (folderId, updater) => {
      for (const pf of stepPathFolders) {
        if (pf && pf.id === folderId)
          updater(pf);
      }
      for (const af of allFolders) {
        if (af && af.id === folderId)
          updater(af);
      }
    };
    const envEntries = Object.entries(norm.envUpdates || {});
    if (envEntries.length > 0) {
      let appliedToActiveEnv = false;
      if (activeEnvId) {
        const activeEnv = environments.find((e) => e && e.id === activeEnvId);
        if (activeEnv) {
          if (!Array.isArray(activeEnv.variables))
            activeEnv.variables = [];
          for (const [k, v] of envEntries) {
            upsertVariableKVPair(activeEnv.variables, k, v);
          }
          appliedToActiveEnv = true;
        }
      }
      if (!appliedToActiveEnv) {
        if (!Array.isArray(collection.variables))
          collection.variables = [];
        for (const [k, v] of envEntries) {
          upsertVariableKVPair(collection.variables, k, v);
        }
      }
    }
    const scoped = norm.scopedEnvUpdates;
    if (scoped) {
      const collEntries = Object.entries(scoped.collection || {});
      if (collEntries.length > 0) {
        if (!Array.isArray(collection.variables))
          collection.variables = [];
        for (const [k, v] of collEntries) {
          upsertVariableKVPair(collection.variables, k, v);
        }
      }
      for (const [envId, kvMap] of Object.entries(scoped.globalEnvs || {})) {
        const targetEnv = environments.find((e) => e && e.id === envId);
        if (targetEnv) {
          if (!Array.isArray(targetEnv.variables))
            targetEnv.variables = [];
          for (const [k, v] of Object.entries(kvMap || {})) {
            upsertVariableKVPair(targetEnv.variables, k, v);
          }
        }
      }
      for (const [fId, kvMap] of Object.entries(scoped.folderGlobals || {})) {
        syncFolderNodes(fId, (node) => {
          if (!Array.isArray(node.variables))
            node.variables = [];
          for (const [k, v] of Object.entries(kvMap || {})) {
            upsertVariableKVPair(node.variables, k, v);
          }
        });
      }
      for (const item of scoped.folderEnvs || []) {
        syncFolderNodes(item.folder, (node) => {
          if (!node.folder_envs || typeof node.folder_envs !== "object") {
            node.folder_envs = {};
          }
          if (!Array.isArray(node.folder_envs[item.env])) {
            node.folder_envs[item.env] = [];
          }
          upsertVariableKVPair(node.folder_envs[item.env], item.key, item.value);
        });
      }
    }
    const authUpdates = norm.scopedAuthUpdates;
    if (authUpdates) {
      if (authUpdates.collectionGlobal) {
        collection.auth = deepClone(authUpdates.collectionGlobal);
      }
      for (const item of authUpdates.collectionEnvs || []) {
        if (!collection.auth_envs || typeof collection.auth_envs !== "object") {
          collection.auth_envs = {};
        }
        collection.auth_envs[item.env] = deepClone(item.auth);
      }
      for (const [fId, authCfg] of Object.entries(authUpdates.folderGlobals || {})) {
        if (!authCfg)
          continue;
        syncFolderNodes(fId, (node) => {
          node.auth = deepClone(authCfg);
        });
      }
      for (const item of authUpdates.folderEnvs || []) {
        if (!item.auth)
          continue;
        syncFolderNodes(item.folder, (node) => {
          if (!node.auth_envs || typeof node.auth_envs !== "object") {
            node.auth_envs = {};
          }
          node.auth_envs[item.env] = deepClone(item.auth);
        });
      }
    }
  }
  function accumulateMergedScriptResult(dst, src) {
    if (!src.success) {
      dst.success = false;
      if (src.error) {
        dst.error = dst.error ? `${dst.error}; ${src.error}` : src.error;
      }
    }
    if (Array.isArray(src.logs) && src.logs.length > 0) {
      dst.logs.push(...src.logs);
    }
    if (Array.isArray(src.logEntries) && src.logEntries.length > 0) {
      dst.logEntries.push(...src.logEntries);
    }
    if (Array.isArray(src.testResults) && src.testResults.length > 0) {
      dst.testResults.push(...src.testResults);
    }
    Object.assign(dst.envUpdates, src.envUpdates || {});
    Object.assign(dst.scopedEnvUpdates.collection, src.scopedEnvUpdates?.collection || {});
    for (const [envId, kvMap] of Object.entries(src.scopedEnvUpdates?.globalEnvs || {})) {
      if (!dst.scopedEnvUpdates.globalEnvs[envId]) {
        dst.scopedEnvUpdates.globalEnvs[envId] = {};
      }
      Object.assign(dst.scopedEnvUpdates.globalEnvs[envId], kvMap || {});
    }
    for (const [fId, kvMap] of Object.entries(src.scopedEnvUpdates?.folderGlobals || {})) {
      if (!dst.scopedEnvUpdates.folderGlobals[fId]) {
        dst.scopedEnvUpdates.folderGlobals[fId] = {};
      }
      Object.assign(dst.scopedEnvUpdates.folderGlobals[fId], kvMap || {});
    }
    for (const item of src.scopedEnvUpdates?.folderEnvs || []) {
      const idx = dst.scopedEnvUpdates.folderEnvs.findIndex((x) => x.folder === item.folder && x.env === item.env && x.key === item.key);
      if (idx >= 0) {
        dst.scopedEnvUpdates.folderEnvs[idx].value = item.value;
      } else {
        dst.scopedEnvUpdates.folderEnvs.push({ ...item });
      }
    }
    if (src.scopedAuthUpdates?.collectionGlobal) {
      dst.scopedAuthUpdates.collectionGlobal = deepClone(src.scopedAuthUpdates.collectionGlobal);
    }
    for (const item of src.scopedAuthUpdates?.collectionEnvs || []) {
      if (!dst.scopedAuthUpdates.collectionEnvs) {
        dst.scopedAuthUpdates.collectionEnvs = [];
      }
      const idx = dst.scopedAuthUpdates.collectionEnvs.findIndex((x) => x.env === item.env);
      if (idx >= 0) {
        dst.scopedAuthUpdates.collectionEnvs[idx].auth = deepClone(item.auth);
      } else {
        dst.scopedAuthUpdates.collectionEnvs.push({
          env: item.env,
          auth: deepClone(item.auth)
        });
      }
    }
    for (const [fId, authCfg] of Object.entries(src.scopedAuthUpdates?.folderGlobals || {})) {
      dst.scopedAuthUpdates.folderGlobals[fId] = deepClone(authCfg);
    }
    for (const item of src.scopedAuthUpdates?.folderEnvs || []) {
      const idx = dst.scopedAuthUpdates.folderEnvs.findIndex((x) => x.folder === item.folder && x.env === item.env);
      if (idx >= 0) {
        dst.scopedAuthUpdates.folderEnvs[idx].auth = deepClone(item.auth);
      } else {
        dst.scopedAuthUpdates.folderEnvs.push({
          folder: item.folder,
          env: item.env,
          auth: deepClone(item.auth)
        });
      }
    }
  }
  function wasVariableMutatedInScriptResult(key, res) {
    if (!key)
      return false;
    if (res.envUpdates && Object.prototype.hasOwnProperty.call(res.envUpdates, key)) {
      return true;
    }
    const scoped = res.scopedEnvUpdates;
    if (!scoped)
      return false;
    if (scoped.collection && Object.prototype.hasOwnProperty.call(scoped.collection, key)) {
      return true;
    }
    for (const kvMap of Object.values(scoped.globalEnvs || {})) {
      if (kvMap && Object.prototype.hasOwnProperty.call(kvMap, key)) {
        return true;
      }
    }
    for (const kvMap of Object.values(scoped.folderGlobals || {})) {
      if (kvMap && Object.prototype.hasOwnProperty.call(kvMap, key)) {
        return true;
      }
    }
    for (const item of scoped.folderEnvs || []) {
      if (item && item.key === key) {
        return true;
      }
    }
    return false;
  }
  function mergeParallelScriptUpdates(baseState, stepOutputs, initialOrderedFolderIds) {
    const collection = deepClone(baseState?.collection || { id: "default", name: "Default", variables: [] });
    const environments = deepClone(baseState?.environments || []);
    const allFolders = deepClone(baseState?.allFolders || []);
    const rawActiveEnvId = baseState?.activeEnvId !== undefined ? baseState.activeEnvId : collection.active_env_id || null;
    const activeEnvId = resolveEnvIdInMemory(rawActiveEnvId, rawActiveEnvId, environments);
    const mergedScriptResult = {
      success: true,
      logs: [],
      logEntries: [],
      testResults: [],
      envUpdates: {},
      scopedEnvUpdates: {
        collection: {},
        globalEnvs: {},
        folderGlobals: {},
        folderEnvs: []
      },
      scopedAuthUpdates: {
        folderGlobals: {},
        folderEnvs: [],
        collectionEnvs: []
      },
      requestMutations: {}
    };
    const orderedStepFolderIds = [];
    const recordOrderedFolderId = (fid) => {
      if (!fid)
        return;
      const existingIdx = orderedStepFolderIds.indexOf(fid);
      if (existingIdx !== -1) {
        orderedStepFolderIds.splice(existingIdx, 1);
      }
      orderedStepFolderIds.push(fid);
    };
    const seedFolders = initialOrderedFolderIds || baseState?.orderedStepFolderIds || [];
    for (const fid of seedFolders) {
      recordOrderedFolderId(fid);
    }
    const items = Array.isArray(stepOutputs) ? stepOutputs : [];
    for (const item of items) {
      if (!item)
        continue;
      const stepPathFolders = deepClone(item.pathFolders || []);
      for (const pf of stepPathFolders) {
        if (!pf || !pf.id)
          continue;
        if (!allFolders.some((af) => af && af.id === pf.id)) {
          allFolders.push(deepClone(pf));
        }
        recordOrderedFolderId(pf.id);
      }
      const rawResults = [];
      if (item.preScriptResult)
        rawResults.push(item.preScriptResult);
      if (item.postScriptResult)
        rawResults.push(item.postScriptResult);
      if (item.scriptResult)
        rawResults.push(item.scriptResult);
      if (!item.scriptResult && !item.preScriptResult && !item.postScriptResult && (item.envUpdates || item.scopedEnvUpdates || item.scopedAuthUpdates)) {
        rawResults.push({
          envUpdates: item.envUpdates || {},
          scopedEnvUpdates: {
            collection: item.scopedEnvUpdates?.collection || {},
            globalEnvs: item.scopedEnvUpdates?.globalEnvs || {},
            folderGlobals: item.scopedEnvUpdates?.folderGlobals || {},
            folderEnvs: item.scopedEnvUpdates?.folderEnvs || []
          },
          scopedAuthUpdates: {
            folderGlobals: item.scopedAuthUpdates?.folderGlobals || {},
            folderEnvs: item.scopedAuthUpdates?.folderEnvs || [],
            collectionGlobal: item.scopedAuthUpdates?.collectionGlobal,
            collectionEnvs: item.scopedAuthUpdates?.collectionEnvs || []
          }
        });
      }
      for (const rawRes of rawResults) {
        const normalized = normalizeStepScriptResult(rawRes, stepPathFolders, allFolders, activeEnvId, environments);
        for (const fId of Object.keys(normalized.scopedEnvUpdates?.folderGlobals || {})) {
          recordOrderedFolderId(fId);
        }
        for (const fe of normalized.scopedEnvUpdates?.folderEnvs || []) {
          if (fe?.folder)
            recordOrderedFolderId(fe.folder);
        }
        applyNormalizedUpdatesToState(normalized, collection, environments, activeEnvId, stepPathFolders, allFolders);
        accumulateMergedScriptResult(mergedScriptResult, normalized);
      }
    }
    const effectivePathFolders = orderedStepFolderIds.map((fid) => allFolders.find((f) => f && f.id === fid)).filter((f) => Boolean(f));
    const activeEnv = activeEnvId ? environments.find((e) => e && e.id === activeEnvId) : undefined;
    const varsMap = resolveHierarchyVariables({
      collectionVariables: collection.variables || [],
      activeEnvVariables: activeEnv?.variables || [],
      pathFolders: effectivePathFolders,
      activeEnvId: activeEnvId || null
    });
    for (const [k, v] of Object.entries(mergedScriptResult.envUpdates || {})) {
      const trimmedKey = k.trim();
      if (trimmedKey !== "" && !varsMap.has(trimmedKey)) {
        varsMap.set(trimmedKey, v);
      }
    }
    if (baseState?.cliVarOverrides) {
      for (const [k, v] of Object.entries(baseState.cliVarOverrides)) {
        const trimmedKey = k.trim();
        if (trimmedKey !== "" && !wasVariableMutatedInScriptResult(trimmedKey, mergedScriptResult)) {
          varsMap.set(trimmedKey, v);
        }
      }
    }
    return {
      collection,
      environments,
      activeEnvId: activeEnvId || null,
      allFolders,
      resolvedVariables: Object.fromEntries(varsMap),
      mergedScriptResult
    };
  }

  // src/utils/headless-engine.ts
  var stripJsonComments = stripJsoncToJson;
  var runPreRequestScript = executeScript;
  var runPostResponseScript = executeScript;
  function resolveHeaders(requestHeaders = [], inheritedHeaders = [], vars = new Map) {
    const merged = mergeHeaders(requestHeaders, inheritedHeaders);
    return merged.filter((h) => h.enabled && h.key.trim() !== "").map((h) => ({
      key: h.key.trim(),
      value: resolveVariables(h.value || "", vars),
      enabled: true
    }));
  }
  function resolveAuth(auth, pathNodes = [], vars = new Map, options) {
    const { auth: effectiveAuth } = resolveEffectiveAuth(auth, pathNodes, options);
    return getAuthArtifacts(effectiveAuth, vars);
  }
  function reconcileUrlAndParams(url, params = [], pathParams = []) {
    const { params: parsedFromUrl } = parseUrl(url || "");
    const existingParams = Array.isArray(params) ? params : [];
    const mergedParams = parsedFromUrl.map((p) => ({ ...p }));
    const usedIndices = new Set;
    for (const ep of existingParams) {
      if (!ep || typeof ep.key !== "string" || ep.key.trim() === "")
        continue;
      if (!ep.enabled) {
        mergedParams.push({ ...ep });
        continue;
      }
      const epVal = ep.value ?? "";
      const matchIdx = mergedParams.findIndex((mp, idx) => !usedIndices.has(idx) && mp.enabled && mp.key === ep.key && mp.value === epVal);
      if (matchIdx !== -1) {
        usedIndices.add(matchIdx);
        if (ep.description !== undefined) {
          mergedParams[matchIdx].description = ep.description;
        }
        if (ep._isAuto !== undefined) {
          mergedParams[matchIdx]._isAuto = ep._isAuto;
        }
      } else {
        mergedParams.push({ ...ep, value: epVal });
      }
    }
    const nextUrl = updateUrlWithParams(url || "", mergedParams);
    const nextPathParams = reconcilePathParamsFromUrl(nextUrl, pathParams || []);
    return {
      url: nextUrl,
      params: mergedParams,
      path_params: nextPathParams
    };
  }
  function deepClone2(val) {
    if (val === undefined || val === null)
      return val;
    return JSON.parse(JSON.stringify(val));
  }
  function upsertKVPair(list, key, value) {
    const existing = list.find((item) => item && item.key === key);
    if (existing) {
      existing.value = value;
      existing.enabled = true;
    } else {
      list.push({ key, value, enabled: true });
    }
  }
  function resolveEnvIdInMemory2(envSelector, activeEnvId, environments) {
    if (!envSelector || envSelector === "__active__") {
      return activeEnvId || null;
    }
    const trimmed = envSelector.trim();
    const lower = trimmed.toLowerCase();
    const matched = environments.find((e) => e && (e.id?.toLowerCase() === lower || e.name?.trim().toLowerCase() === lower));
    return matched ? matched.id : trimmed;
  }
  function resolveFolderIdInMemory2(folderSelector, pathFolders, allFolders) {
    if (!folderSelector || folderSelector === "__nearest__") {
      return pathFolders.length > 0 ? pathFolders[pathFolders.length - 1].id : null;
    }
    const trimmed = folderSelector.trim();
    const lower = trimmed.toLowerCase();
    for (let i = pathFolders.length - 1;i >= 0; i--) {
      const f = pathFolders[i];
      if (f && (f.id?.toLowerCase() === lower || f.name?.trim().toLowerCase() === lower)) {
        return f.id;
      }
    }
    const inAll = allFolders.find((f) => f && (f.id?.toLowerCase() === lower || f.name?.trim().toLowerCase() === lower));
    if (inAll)
      return inAll.id;
    return null;
  }
  function applyScriptUpdatesInMemory(scriptRes, collection, environments, activeEnvId, pathFolders, allFolders) {
    const syncFolderNodes = (folderId, updater) => {
      for (const pf of pathFolders) {
        if (pf && pf.id === folderId)
          updater(pf);
      }
      for (const af of allFolders) {
        if (af && af.id === folderId)
          updater(af);
      }
    };
    const envEntries = Object.entries(scriptRes.envUpdates || {});
    if (envEntries.length > 0) {
      let appliedToActiveEnv = false;
      if (activeEnvId) {
        const activeEnv = environments.find((e) => e && e.id === activeEnvId);
        if (activeEnv) {
          if (!Array.isArray(activeEnv.variables))
            activeEnv.variables = [];
          for (const [k, v] of envEntries) {
            upsertKVPair(activeEnv.variables, k, v);
          }
          appliedToActiveEnv = true;
        }
      }
      if (!appliedToActiveEnv) {
        if (!Array.isArray(collection.variables))
          collection.variables = [];
        for (const [k, v] of envEntries) {
          upsertKVPair(collection.variables, k, v);
        }
      }
    }
    const scoped = scriptRes.scopedEnvUpdates;
    if (scoped) {
      const collEntries = Object.entries(scoped.collection || {});
      if (collEntries.length > 0) {
        if (!Array.isArray(collection.variables))
          collection.variables = [];
        for (const [k, v] of collEntries) {
          upsertKVPair(collection.variables, k, v);
        }
      }
      for (const [envKey, kvMap] of Object.entries(scoped.globalEnvs || {})) {
        const targetEnvId = resolveEnvIdInMemory2(envKey, activeEnvId, environments);
        if (!targetEnvId)
          continue;
        const targetEnv = environments.find((e) => e && e.id === targetEnvId);
        if (targetEnv) {
          if (!Array.isArray(targetEnv.variables))
            targetEnv.variables = [];
          for (const [k, v] of Object.entries(kvMap || {})) {
            upsertKVPair(targetEnv.variables, k, v);
          }
        }
      }
      for (const [folderSel, kvMap] of Object.entries(scoped.folderGlobals || {})) {
        const fId = resolveFolderIdInMemory2(folderSel, pathFolders, allFolders);
        if (!fId)
          continue;
        syncFolderNodes(fId, (node) => {
          if (!Array.isArray(node.variables))
            node.variables = [];
          for (const [k, v] of Object.entries(kvMap || {})) {
            upsertKVPair(node.variables, k, v);
          }
        });
      }
      for (const item of scoped.folderEnvs || []) {
        const fId = resolveFolderIdInMemory2(item.folder, pathFolders, allFolders);
        const targetEnvId = resolveEnvIdInMemory2(item.env, activeEnvId, environments);
        if (!fId || !targetEnvId)
          continue;
        syncFolderNodes(fId, (node) => {
          if (!node.folder_envs || typeof node.folder_envs !== "object") {
            node.folder_envs = {};
          }
          if (!Array.isArray(node.folder_envs[targetEnvId])) {
            node.folder_envs[targetEnvId] = [];
          }
          upsertKVPair(node.folder_envs[targetEnvId], item.key, item.value);
        });
      }
    }
    const authUpdates = scriptRes.scopedAuthUpdates;
    if (authUpdates) {
      if (authUpdates.collectionGlobal !== undefined && authUpdates.collectionGlobal) {
        collection.auth = deepClone2(authUpdates.collectionGlobal);
      }
      for (const item of authUpdates.collectionEnvs || []) {
        const targetEnvId = resolveEnvIdInMemory2(item.env, activeEnvId, environments);
        if (!targetEnvId)
          continue;
        if (!collection.auth_envs || typeof collection.auth_envs !== "object") {
          collection.auth_envs = {};
        }
        collection.auth_envs[targetEnvId] = deepClone2(item.auth);
      }
      for (const [folderSel, authCfg] of Object.entries(authUpdates.folderGlobals || {})) {
        if (!authCfg)
          continue;
        const fId = resolveFolderIdInMemory2(folderSel, pathFolders, allFolders);
        if (!fId)
          continue;
        syncFolderNodes(fId, (node) => {
          node.auth = deepClone2(authCfg);
        });
      }
      for (const item of authUpdates.folderEnvs || []) {
        if (!item.auth)
          continue;
        const fId = resolveFolderIdInMemory2(item.folder, pathFolders, allFolders);
        const targetEnvId = resolveEnvIdInMemory2(item.env, activeEnvId, environments);
        if (!fId || !targetEnvId)
          continue;
        syncFolderNodes(fId, (node) => {
          if (!node.auth_envs || typeof node.auth_envs !== "object") {
            node.auth_envs = {};
          }
          node.auth_envs[targetEnvId] = deepClone2(item.auth);
        });
      }
    }
  }
  function computeResolvedVariables(collection, environments, activeEnvId, pathFolders, cliVarOverrides) {
    const activeEnv = activeEnvId ? environments.find((e) => e && e.id === activeEnvId) : undefined;
    const vars = resolveHierarchyVariables({
      collectionVariables: collection.variables || [],
      activeEnvVariables: activeEnv?.variables || [],
      pathFolders,
      activeEnvId: activeEnvId || null
    });
    if (cliVarOverrides) {
      for (const [k, v] of Object.entries(cliVarOverrides)) {
        if (k.trim() !== "") {
          vars.set(k.trim(), v);
        }
      }
    }
    return vars;
  }
  function prepareHeadlessExecution(input) {
    const effectiveReq = deepClone2(input.request);
    const mutatedCollection = deepClone2(input.collection || { id: "default", name: "Default", variables: [] });
    const mutatedEnvironments = deepClone2(input.environments || []);
    const mutatedPathFolders = deepClone2(input.pathFolders || []);
    const mutatedAllFolders = deepClone2(input.allFolders && input.allFolders.length > 0 ? input.allFolders : mutatedPathFolders);
    const effectiveActiveEnvId = input.activeEnvId !== undefined ? input.activeEnvId : mutatedCollection.active_env_id || null;
    const reconciled = reconcileUrlAndParams(effectiveReq.url || "", effectiveReq.params || [], effectiveReq.path_params || []);
    effectiveReq.url = reconciled.url;
    effectiveReq.params = reconciled.params;
    effectiveReq.path_params = reconciled.path_params;
    let vars = computeResolvedVariables(mutatedCollection, mutatedEnvironments, effectiveActiveEnvId, mutatedPathFolders, input.cliVarOverrides);
    let preScriptResult = null;
    const preScriptCode = effectiveReq.scripts?.pre_request?.trim() || "";
    if (preScriptCode !== "") {
      preScriptResult = executeScript(preScriptCode, {
        variables: vars,
        request: effectiveReq,
        collectionVariables: mutatedCollection.variables,
        collectionAuth: mutatedCollection.auth,
        collectionAuthEnvs: mutatedCollection.auth_envs,
        environments: mutatedEnvironments,
        activeEnvId: effectiveActiveEnvId,
        pathFolders: mutatedPathFolders,
        allFolders: mutatedAllFolders
      });
      const mut = preScriptResult.requestMutations;
      if (mut.url !== undefined)
        effectiveReq.url = mut.url;
      if (mut.method !== undefined)
        effectiveReq.method = mut.method;
      if (mut.params !== undefined)
        effectiveReq.params = mut.params.map((p) => ({ ...p }));
      if (mut.path_params !== undefined)
        effectiveReq.path_params = mut.path_params.map((p) => ({ ...p }));
      if (mut.headers !== undefined)
        effectiveReq.headers = mut.headers.map((h) => ({ ...h }));
      if (mut.body !== undefined) {
        if (!effectiveReq.body)
          effectiveReq.body = { type: "none", content: "" };
        if (mut.body.type !== undefined)
          effectiveReq.body.type = mut.body.type;
        if (mut.body.content !== undefined) {
          effectiveReq.body.content = mut.body.content;
          delete effectiveReq.body.urlencoded;
          delete effectiveReq.body.form_data;
        }
      }
      if (mut.auth !== undefined) {
        effectiveReq.auth = mut.auth;
      }
      if (mut.url !== undefined || mut.params !== undefined) {
        if (mut.url !== undefined && mut.params === undefined) {
          effectiveReq.params = reconcileParamsFromUrl(effectiveReq.url, effectiveReq.params || []);
        }
        effectiveReq.url = updateUrlWithParams(effectiveReq.url, effectiveReq.params || []);
        if (mut.path_params === undefined) {
          effectiveReq.path_params = reconcilePathParamsFromUrl(effectiveReq.url, effectiveReq.path_params || []);
        }
      }
      const scriptMutatedVars = new Map(vars);
      applyScriptUpdatesInMemory(preScriptResult, mutatedCollection, mutatedEnvironments, effectiveActiveEnvId, mutatedPathFolders, mutatedAllFolders);
      vars = scriptMutatedVars;
    }
    const inheritedHeaders = getInheritedHeaders(mutatedPathFolders);
    const executeRequest = buildExecuteRequest(effectiveReq, vars, inheritedHeaders, mutatedPathFolders, {
      activeEnvId: effectiveActiveEnvId,
      requestAuthEnvs: effectiveReq.auth_envs,
      collection: mutatedCollection
    });
    return {
      executeRequest,
      effectiveRequest: effectiveReq,
      resolvedVariables: Object.fromEntries(vars),
      preScriptResult,
      mutatedCollection,
      mutatedEnvironments,
      mutatedPathFolders,
      mutatedAllFolders
    };
  }
  function runHeadlessPostResponse(input) {
    const effectiveReq = input.effectiveRequest;
    const postScriptCode = effectiveReq?.scripts?.post_response?.trim() || "";
    if (postScriptCode === "") {
      return null;
    }
    const mutatedCollection = deepClone2(input.collection || { id: "default", name: "Default", variables: [] });
    const mutatedEnvironments = deepClone2(input.environments || []);
    const mutatedPathFolders = deepClone2(input.pathFolders || []);
    const mutatedAllFolders = deepClone2(input.allFolders && input.allFolders.length > 0 ? input.allFolders : mutatedPathFolders);
    const effectiveActiveEnvId = input.activeEnvId !== undefined ? input.activeEnvId : mutatedCollection.active_env_id || null;
    const vars = input.resolvedVariables ? new Map(Object.entries(input.resolvedVariables)) : computeResolvedVariables(mutatedCollection, mutatedEnvironments, effectiveActiveEnvId, mutatedPathFolders, input.cliVarOverrides);
    return executeScript(postScriptCode, {
      variables: vars,
      response: {
        ...input.response,
        timestamp: input.response.timestamp || new Date().toISOString(),
        truncated: Boolean(input.response.truncated),
        is_binary: Boolean(input.response.is_binary)
      },
      request: effectiveReq,
      collectionVariables: mutatedCollection.variables,
      collectionAuth: mutatedCollection.auth,
      collectionAuthEnvs: mutatedCollection.auth_envs,
      environments: mutatedEnvironments,
      activeEnvId: effectiveActiveEnvId,
      pathFolders: mutatedPathFolders,
      allFolders: mutatedAllFolders
    });
  }
  var prepareRequestExecution = prepareHeadlessExecution;
  var finalizeResponseExecution = runHeadlessPostResponse;
  var HeadlessBundleExports = {
    resolveVariables,
    parseVariables,
    getInheritedHeaders,
    mergeHeaders,
    getDefaultHeaders,
    resolveHeaders,
    resolveEffectiveAuth,
    getAuthArtifacts,
    resolveAuth,
    toBase64,
    resolveHierarchyVariables,
    buildExecuteRequest,
    executeScript,
    runPreRequestScript,
    runPostResponseScript,
    isCurlCommand,
    parseCurlCommand,
    generateCurlCommand,
    stripJsoncToJson,
    stripJsonComments,
    reconcileParamsFromUrl,
    reconcilePathParamsFromUrl,
    updateUrlWithParams,
    reconcileUrlAndParams,
    parseUrl,
    resolvePathParamsInUrl,
    applyScriptUpdatesInMemory,
    prepareHeadlessExecution,
    prepareRequestExecution,
    runHeadlessPostResponse,
    finalizeResponseExecution,
    countStepsInNodes,
    evaluateStepVerdict,
    evaluateCustomBranchCondition,
    selectMatchingBranch,
    mergeParallelScriptUpdates
  };
  if (typeof globalThis !== "undefined") {
    globalThis.HectoEngine = HeadlessBundleExports;
    globalThis.HectoHeadless = HeadlessBundleExports;
  }
})();
