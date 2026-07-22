import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEmptyWorkspace, createRequest, type Workspace } from "@openapi-collection-studio/core";
import {
  MAX_BACKUP_BYTES,
  atomicWriteFile,
  createStorageService,
  storagePaths,
  type AtomicWriter,
  type SecureStorageAdapter
} from "./storageService";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function testDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "specfold-storage-"));
  temporaryDirectories.push(path);
  return path;
}

function secureStorage(available = true): SecureStorageAdapter {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (value) => Buffer.from(`protected:${value}`, "utf8"),
    decryptString: (value) => value.toString("utf8").replace(/^protected:/, "")
  };
}

function workspaceWithSecret(name: string, secret: string): Workspace {
  const workspace = createEmptyWorkspace(name);
  workspace.environments[0].variables.push({
    id: "envvar-secret",
    name: "apiToken",
    value: secret,
    enabled: true,
    secret: true
  });
  return workspace;
}

describe("storage service", () => {
  it("round-trips a complete backup and re-encrypts restored secrets", async () => {
    const userData = await testDirectory();
    const paths = storagePaths(userData);
    const service = createStorageService({ paths, secureStorage: secureStorage(), appVersion: "1.1.0" });
    const original = workspaceWithSecret("Original", "top-secret-token");
    await service.saveSettings({ requestTimeoutMs: 1234, maxResponseBytes: 2048, allowInsecureTls: true, theme: "dark", fontSize: "large" });
    const backupPath = join(userData, "complete-backup.json");
    await service.writeBackup(backupPath, original);

    expect(await readFile(backupPath, "utf8")).toContain("top-secret-token");
    const result = await service.restoreBackupFile(backupPath);
    const persisted = await readFile(paths.workspace, "utf8");

    expect(result.restored).toBe(true);
    expect(result.workspace?.name).toBe("Original");
    expect(result.workspace?.environments[0].variables[0].value).toBe("top-secret-token");
    expect(result.settings?.requestTimeoutMs).toBe(1234);
    expect(result.settings?.theme).toBe("dark");
    expect(persisted).not.toContain("top-secret-token");
    expect(persisted).toContain("enc:v1:");
  });

  it("rolls back workspace and settings when the second restore write fails", async () => {
    const userData = await testDirectory();
    const paths = storagePaths(userData);
    await mkdir(userData, { recursive: true });
    const oldWorkspace = createEmptyWorkspace("Before restore");
    const oldSettings = { requestTimeoutMs: 30000, maxResponseBytes: 1024, allowInsecureTls: false, theme: "system", fontSize: "compact" };
    await writeFile(paths.workspace, JSON.stringify(oldWorkspace), "utf8");
    await writeFile(paths.settings, JSON.stringify(oldSettings), "utf8");

    let failed = false;
    const writer: AtomicWriter = async (path, content, mode) => {
      if (path === paths.settings && !failed) {
        failed = true;
        throw new Error("simulated settings write failure");
      }
      await atomicWriteFile(path, content, mode);
    };
    const service = createStorageService({
      paths,
      secureStorage: secureStorage(),
      appVersion: "1.1.0",
      atomicWrite: writer
    });
    const backup = {
      schema: "specfold.backup.v1",
      exportedAt: new Date().toISOString(),
      appVersion: "1.1.0",
      secretsIncluded: true,
      workspace: createEmptyWorkspace("After restore"),
      settings: { requestTimeoutMs: 1, maxResponseBytes: 2, allowInsecureTls: true, theme: "dark", fontSize: "default" }
    };

    await expect(service.restoreBackupText(JSON.stringify(backup))).rejects.toThrow("previous data was restored");
    expect(JSON.parse(await readFile(paths.workspace, "utf8")).name).toBe("Before restore");
    expect(JSON.parse(await readFile(paths.settings, "utf8")).requestTimeoutMs).toBe(30000);
    expect((await readdir(paths.backups)).some((name) => name.startsWith("restore-safety-"))).toBe(true);
  });

  it("never persists plaintext secret values when secure storage is unavailable", async () => {
    const userData = await testDirectory();
    const paths = storagePaths(userData);
    const service = createStorageService({ paths, secureStorage: secureStorage(false), appVersion: "1.1.0" });
    await service.saveWorkspace(workspaceWithSecret("Unsafe host", "must-not-reach-disk"));
    const persisted = await readFile(paths.workspace, "utf8");
    const loaded = await service.loadWorkspace();

    expect(persisted).not.toContain("must-not-reach-disk");
    expect(loaded.secureStorageAvailable).toBe(false);
    expect(loaded.workspace.environments[0].variables[0].value).toBe("");
  });

  it("encrypts literal request credentials and sensitive examples at rest", async () => {
    const userData = await testDirectory();
    const paths = storagePaths(userData);
    const service = createStorageService({ paths, secureStorage: secureStorage(), appVersion: "1.3.1" });
    const workspace = createEmptyWorkspace("Credential storage");
    const request = createRequest({ name: "Profile", method: "POST", url: "https://api.example.test/profile" });
    request.auth = { type: "bearer", token: "literal-bearer-token" };
    request.headers.push({ id: "auth", key: "Authorization", value: "Bearer literal-header-token", enabled: true });
    request.body = { mode: "json", raw: '{"client_secret":"literal-body-secret"}' };
    request.responseExamples.push({
      id: "response",
      name: "Token response",
      status: 200,
      headers: [],
      body: '{"access_token":"literal-response-token"}'
    });
    workspace.collections = [{ id: "collection", name: "Credentials", folders: [], requests: [request] }];

    await service.saveWorkspace(workspace);
    const persisted = await readFile(paths.workspace, "utf8");
    const loaded = await service.loadWorkspace();
    const loadedRequest = loaded.workspace.collections[0].requests[0];

    expect(persisted).not.toContain("literal-bearer-token");
    expect(persisted).not.toContain("literal-header-token");
    expect(persisted).not.toContain("literal-body-secret");
    expect(persisted).not.toContain("literal-response-token");
    expect(loadedRequest.auth).toEqual({ type: "bearer", token: "literal-bearer-token" });
    expect(loadedRequest.headers[0].value).toBe("Bearer literal-header-token");
    expect(loadedRequest.body.raw).toBe('{"client_secret":"literal-body-secret"}');
    expect(loadedRequest.responseExamples[0].body).toBe('{"access_token":"literal-response-token"}');
  });

  it("never persists or backs up session-only multipart upload ids", async () => {
    const userData = await testDirectory();
    const paths = storagePaths(userData);
    const service = createStorageService({ paths, secureStorage: secureStorage(), appVersion: "1.2.1" });
    const workspace = createEmptyWorkspace("Uploads");
    workspace.collections = [{
      id: "collection",
      name: "Files",
      folders: [],
      requests: [{
        id: "request",
        name: "Upload",
        method: "POST",
        url: "https://example.test/upload",
        queryParams: [],
        pathParams: [],
        headers: [],
        auth: { type: "none" },
        responseExamples: [],
        body: {
          mode: "multipart",
          multipart: [{
            id: "part",
            key: "file",
            type: "file",
            value: "",
            enabled: true,
            uploadId: "must-not-reach-disk",
            fileName: "report.pdf"
          }]
        }
      }]
    }];

    await service.saveWorkspace(workspace);
    const backup = await service.createBackupDocument(workspace);
    const persisted = await readFile(paths.workspace, "utf8");
    const loaded = await service.loadWorkspace();

    expect(persisted).not.toContain("must-not-reach-disk");
    expect(JSON.stringify(backup)).not.toContain("must-not-reach-disk");
    expect(loaded.workspace.collections[0].requests[0].body.multipart?.[0]).toMatchObject({
      enabled: false,
      fileName: "report.pdf"
    });
    expect(loaded.workspace.collections[0].requests[0].body.multipart?.[0].uploadId).toBeUndefined();
    expect(workspace.collections[0].requests[0].body.multipart?.[0].uploadId).toBe(
      "must-not-reach-disk"
    );
  });

  it("rejects unsupported, malformed, and oversized backups", async () => {
    const userData = await testDirectory();
    const paths = storagePaths(userData);
    const service = createStorageService({ paths, secureStorage: secureStorage(), appVersion: "1.1.0" });
    await expect(service.restoreBackupText(JSON.stringify({ schema: "other.backup" }))).rejects.toThrow("specfold.backup.v1");
    await expect(service.restoreBackupText(JSON.stringify({
      schema: "specfold.backup.v1",
      workspace: { schemaVersion: 1, collections: {}, environments: [] },
      settings: {}
    }))).rejects.toThrow("collection and environment arrays");

    const largePath = join(userData, "large.backup.json");
    await writeFile(largePath, "{}", "utf8");
    await truncate(largePath, MAX_BACKUP_BYTES + 1);
    await expect(service.restoreBackupFile(largePath)).rejects.toThrow("larger than 100 MB");
  });

  it("deletes only Specfold data and keeps unrelated user-data files", async () => {
    const userData = await testDirectory();
    const paths = storagePaths(userData);
    const service = createStorageService({ paths, secureStorage: secureStorage(), appVersion: "1.1.0" });
    await mkdir(paths.backups, { recursive: true });
    await writeFile(paths.workspace, "workspace", "utf8");
    await writeFile(paths.settings, "settings", "utf8");
    await writeFile(join(paths.backups, "backup.json"), "backup", "utf8");
    await writeFile(join(userData, "workspace.corrupt-old.json"), "corrupt", "utf8");
    const unrelated = join(userData, "keep-me.txt");
    await writeFile(unrelated, "keep", "utf8");

    await service.deleteAllLocalData();
    expect(await readFile(unrelated, "utf8")).toBe("keep");
    await expect(stat(paths.workspace)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(paths.settings)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(paths.backups)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
