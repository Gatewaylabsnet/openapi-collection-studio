import type { ApiRequest, Collection, Environment, Folder, KeyValue } from "../model/types";
import { folderBaseUrl } from "../model/traversal";

export interface VariableResolution {
  value: string;
  missing: string[];
}

export interface ResolvedRequest {
  request: ApiRequest;
  missing: string[];
}

const VARIABLE_PATTERN = /\{\{\s*([A-Za-z_][A-Za-z0-9_.-]*)\s*\}\}/g;

export function environmentToMap(
  environment?: Environment,
  collection?: Pick<Collection, "baseUrl">,
  folderPath: readonly Pick<Folder, "baseUrl">[] = []
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const variable of environment?.variables ?? []) {
    const name = variable.name.trim();
    if (variable.enabled && name) {
      if (name === "baseUrl" && !variable.value.trim()) {
        continue;
      }
      map[name] = variable.value;
    }
  }
  const collectionBaseUrl = collection?.baseUrl?.trim();
  if (collectionBaseUrl) {
    map.baseUrl = collectionBaseUrl;
  }
  const scopedFolderBaseUrl = folderBaseUrl(folderPath);
  if (scopedFolderBaseUrl) {
    map.baseUrl = scopedFolderBaseUrl;
  }
  return map;
}

const MAX_RESOLUTION_PASSES = 5;

export function resolveVariablesInText(
  input: string,
  variables: Record<string, string>
): VariableResolution {
  const missing = new Set<string>();
  let value = input;

  // Resolve up to a few passes so a variable whose value references another
  // variable (e.g. baseUrl composed from host + scheme) is fully expanded.
  // The pass limit also prevents an infinite loop on self-referential values.
  for (let pass = 0; pass < MAX_RESOLUTION_PASSES; pass += 1) {
    let replaced = false;
    missing.clear();
    value = value.replace(VARIABLE_PATTERN, (match, name: string) => {
      if (Object.prototype.hasOwnProperty.call(variables, name)) {
        replaced = true;
        return variables[name];
      }
      missing.add(name);
      return match;
    });
    // Stop once a pass makes no further substitution. Missing variables alone
    // do not end the loop, since an expanded value may introduce new ones.
    if (!replaced) {
      break;
    }
  }

  return {
    value,
    missing: [...missing]
  };
}

export function findMissingVariables(input: string, variables: Record<string, string>): string[] {
  return resolveVariablesInText(input, variables).missing;
}

export function resolveKeyValues(
  values: KeyValue[],
  variables: Record<string, string>
): { values: KeyValue[]; missing: string[] } {
  const missing = new Set<string>();
  const resolved = values.map((item) => {
    const key = resolveVariablesInText(item.key, variables);
    const value = resolveVariablesInText(item.value, variables);
    key.missing.forEach((name) => missing.add(name));
    value.missing.forEach((name) => missing.add(name));
    return {
      ...item,
      key: key.value,
      value: value.value
    };
  });

  return {
    values: resolved,
    missing: [...missing]
  };
}

export function resolveRequestVariables(
  request: ApiRequest,
  environment?: Environment,
  collection?: Pick<Collection, "baseUrl">,
  folderPath: readonly Pick<Folder, "baseUrl">[] = []
): ResolvedRequest {
  const variables = environmentToMap(environment, collection, folderPath);
  const missing = new Set<string>();
  const url = resolveVariablesInText(request.url, variables);
  url.missing.forEach((name) => missing.add(name));

  const queryParams = resolveKeyValues(request.queryParams, variables);
  const pathParams = resolveKeyValues(request.pathParams, variables);
  const headers = resolveKeyValues(request.headers, variables);
  queryParams.missing.forEach((name) => missing.add(name));
  pathParams.missing.forEach((name) => missing.add(name));
  headers.missing.forEach((name) => missing.add(name));

  const rawBody =
    typeof request.body.raw === "string"
      ? resolveVariablesInText(request.body.raw, variables)
      : { value: undefined, missing: [] as string[] };
  rawBody.missing.forEach((name) => missing.add(name));

  const formBody = request.body.form
    ? resolveKeyValues(request.body.form, variables)
    : undefined;
  formBody?.missing.forEach((name) => missing.add(name));

  const auth = { ...request.auth };
  if (auth.type === "bearer") {
    const resolved = resolveVariablesInText(auth.token, variables);
    auth.token = resolved.value;
    resolved.missing.forEach((name) => missing.add(name));
  }
  if (auth.type === "basic") {
    const username = resolveVariablesInText(auth.username, variables);
    const password = resolveVariablesInText(auth.password, variables);
    auth.username = username.value;
    auth.password = password.value;
    username.missing.forEach((name) => missing.add(name));
    password.missing.forEach((name) => missing.add(name));
  }
  if (auth.type === "apiKey") {
    const key = resolveVariablesInText(auth.key, variables);
    const value = resolveVariablesInText(auth.value, variables);
    auth.key = key.value;
    auth.value = value.value;
    key.missing.forEach((name) => missing.add(name));
    value.missing.forEach((name) => missing.add(name));
  }

  return {
    request: {
      ...request,
      url: url.value,
      queryParams: queryParams.values,
      pathParams: pathParams.values,
      headers: headers.values,
      body: {
        ...request.body,
        raw: rawBody.value,
        form: formBody ? formBody.values : request.body.form
      },
      auth
    },
    missing: [...missing]
  };
}

