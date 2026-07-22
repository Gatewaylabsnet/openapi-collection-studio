import {
  MissingVariablesError,
  flattenFolders,
  folderBaseUrl,
  prepareHttpRequest,
  type ApiRequest,
  type Collection,
  type Environment,
  type Folder
} from "@openapi-collection-studio/core";

export function inheritedBaseUrl(
  collection: Collection,
  folder: Folder,
  folderOptions: ReturnType<typeof flattenFolders>,
  environmentBaseUrl?: string
): string {
  const path = folderOptions.find((item) => item.folder.id === folder.id)?.path ?? [];
  const inherited = firstDefinedBaseUrl(
    folderBaseUrl(path.slice(0, -1)),
    collection.baseUrl,
    environmentBaseUrl
  );
  return inherited ? `Inherited: ${inherited}` : "https://api.example.com/proxy";
}

export function baseUrlRouting(
  collection: Collection,
  folder: Folder | undefined,
  folderOptions: ReturnType<typeof flattenFolders>,
  environmentBaseUrl?: string,
  environmentName?: string
): { effective: string; source: string } {
  if (!folder) {
    const collectionValue = normalizeBaseUrl(collection.baseUrl);
    const environmentValue = normalizeBaseUrl(environmentBaseUrl);
    const effective = collectionValue || environmentValue;
    return {
      effective,
      source: collectionValue
        ? "Collection default"
        : environmentValue
          ? `Inherited from ${environmentName ?? "active"} environment`
          : "Add a collection base URL to resolve relative requests."
    };
  }

  const path = folderOptions.find((item) => item.folder.id === folder.id)?.path ?? [folder];
  const ownValue = normalizeBaseUrl(folder.baseUrl);
  if (ownValue) return { effective: ownValue, source: `${folder.name} folder override` };

  const inheritedFolder = [...path.slice(0, -1)].reverse().find((candidate) => candidate.baseUrl?.trim());
  if (inheritedFolder?.baseUrl) {
    return { effective: inheritedFolder.baseUrl.trim(), source: `Inherited from ${inheritedFolder.name}` };
  }

  const collectionValue = normalizeBaseUrl(collection.baseUrl);
  const environmentValue = normalizeBaseUrl(environmentBaseUrl);
  const effective = collectionValue || environmentValue;
  return {
    effective,
    source: collectionValue
      ? `Inherited from ${collection.name}`
      : environmentValue
        ? `Inherited from ${environmentName ?? "active"} environment`
        : "No folder or collection base URL is configured."
  };
}

function normalizeBaseUrl(value: string | undefined): string {
  return value?.trim() ?? "";
}

function firstDefinedBaseUrl(...values: Array<string | undefined>): string {
  return values.map(normalizeBaseUrl).find(Boolean) ?? "";
}

export function resolveRoutePreview(
  request: ApiRequest,
  environment: Environment | undefined,
  collection: Collection | undefined,
  folder: Folder | undefined,
  folderOptions: ReturnType<typeof flattenFolders>
): { url: string; missing: string[] } {
  const folderPath = folder
    ? folderOptions.find((item) => item.folder.id === folder.id)?.path.map(({ baseUrl }) => ({ baseUrl })) ?? []
    : [];
  try {
    return { url: prepareHttpRequest(request, environment, collection, folderPath).url, missing: [] };
  } catch (error) {
    if (error instanceof MissingVariablesError) return { url: request.url, missing: error.variables };
    return { url: request.url, missing: [] };
  }
}
