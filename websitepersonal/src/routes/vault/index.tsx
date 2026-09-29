import { component$, useStore, useVisibleTask$, $ } from "@builder.io/qwik";
import { type DocumentHead, Link, useNavigate } from "@builder.io/qwik-city";
import {
  getVaultFiles,
  createVaultFile,
  updateVaultFile,
  deleteVaultFile,
  type VaultFile,
} from "../../api";
import { requireToken, watchAuth, signOutCurrent } from "../../firebase";
import { reorderTimestamps } from "../../todo-tree";
import {
  collectVaultDeleteOrder,
  displayVaultFiles,
  isValidVaultPaste,
} from "../../vault-tree";

interface VaultState {
  authLoading: boolean;
  userId: string;
  error: string;
  loadingFiles: boolean;
  files: VaultFile[];
  newFileName: string;
  newMimeType: string;
  newData: string;
  isUploading: boolean;
  currentFolderId: string;
  isEditMode: boolean;
  newFolderName: string;
  clipboardId: string;
  isCut: boolean;
  renameId: string;
  renameText: string;
}

export default component$(() => {
  // Login and Todos links render after auth, in the browser. Read the
  // router during SSR so those client-only Links can resolve it.
  useNavigate();
  const state = useStore<VaultState>({
    authLoading: true,
    userId: "",
    error: "",
    loadingFiles: false,
    files: [],
    newFileName: "",
    newMimeType: "",
    newData: "",
    isUploading: false,
    currentFolderId: "",
    isEditMode: false,
    newFolderName: "",
    clipboardId: "",
    isCut: false,
    renameId: "",
    renameText: "",
  });

  const reloadFiles = $(async () => {
    state.loadingFiles = true;
    try {
      const { token, userId } = await requireToken();
      state.files = await getVaultFiles(token, userId);
      if (
        state.clipboardId &&
        !state.files.some((file) => file.id === state.clipboardId)
      ) {
        state.clipboardId = "";
        state.isCut = false;
      }
      state.error = "";
    } catch (error) {
      state.error = messageOf(error, "Could not load files");
    } finally {
      state.loadingFiles = false;
    }
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => {
    const unsubscribe = watchAuth((userId) => {
      state.userId = userId ?? "";
      state.authLoading = false;
      if (!userId) {
        state.files = [];
        state.loadingFiles = false;
        state.currentFolderId = "";
        state.clipboardId = "";
        state.isCut = false;
        return;
      }
      void reloadFiles();
    });
    cleanup(unsubscribe);
  });

  const handleFileSelect = $(async (event: Event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      state.error =
        "File is quite large and might fail to upload. Recommended max size is 5MB.";
    } else {
      state.error = "";
    }

    const data = await readFileAsDataUrl(file);
    state.newData = data;
    state.newFileName = file.name;
    state.newMimeType = file.type || "application/octet-stream";
  });

  const handleUploadFile = $(async () => {
    if (!state.newData.trim() || !state.userId) return;
    state.isUploading = true;
    try {
      const { token, userId } = await requireToken();
      const created = await createVaultFile(token, userId, {
        parent_id: state.currentFolderId,
        type: "FILE",
        file_name: state.newFileName,
        mime_type: state.newMimeType,
        data: state.newData,
        timestamp: Date.now(),
      });
      state.files = [created, ...state.files];
      state.newData = "";
      state.newFileName = "";
      state.newMimeType = "";
      state.error = "";
      const fileInput = document.getElementById(
        "file-upload",
      ) as HTMLInputElement | null;
      if (fileInput) fileInput.value = "";
    } catch (error) {
      state.error = messageOf(error, "Could not save file");
    } finally {
      state.isUploading = false;
    }
  });

  const handleCreateFolder = $(async () => {
    const name = state.newFolderName.trim();
    if (!name) return;
    state.newFolderName = "";
    try {
      const { token, userId } = await requireToken();
      const created = await createVaultFile(token, userId, {
        parent_id: state.currentFolderId,
        type: "FOLDER",
        file_name: name,
        mime_type: "",
        data: "",
        timestamp: Date.now(),
      });
      state.files = [created, ...state.files];
      state.error = "";
    } catch (error) {
      await reloadFiles();
      state.error = messageOf(error, "Could not create folder");
    }
  });

  const handleSignOut = $(async () => {
    state.error = "";
    try {
      await signOutCurrent();
    } catch (error) {
      state.error = messageOf(error, "Could not sign out");
    }
  });

  const moveFile = $(async (id: string, direction: "up" | "down") => {
    const visible = displayVaultFiles(state.files, state.currentFolderId);
    const index = visible.findIndex((file) => file.id === id);
    const neighbor = visible[direction === "up" ? index - 1 : index + 1];
    const node = visible[index];
    if (!node || !neighbor) return;
    const next = reorderTimestamps(node.timestamp, neighbor.timestamp, direction);
    state.files = state.files.map((file) => {
      if (file.id === node.id) return { ...file, timestamp: next.current };
      if (file.id === neighbor.id) return { ...file, timestamp: next.neighbor };
      return file;
    });
    try {
      const { token, userId } = await requireToken();
      await updateVaultFile(token, userId, node.id, { timestamp: next.current });
      await updateVaultFile(token, userId, neighbor.id, {
        timestamp: next.neighbor,
      });
      state.error = "";
    } catch (error) {
      await reloadFiles();
      state.error = messageOf(error, "Could not save changes");
    }
  });

  const handleDeleteFile = $(async (id: string) => {
    const ids = collectVaultDeleteOrder(id, state.files);
    const remove = new Set(ids);
    state.files = state.files.filter((file) => !remove.has(file.id));
    if (remove.has(state.clipboardId)) {
      state.clipboardId = "";
      state.isCut = false;
    }
    if (remove.has(state.currentFolderId)) state.currentFolderId = "";
    if (remove.has(state.renameId)) state.renameId = "";
    try {
      const { token, userId } = await requireToken();
      for (const fileId of ids) await deleteVaultFile(token, userId, fileId);
      state.error = "";
    } catch (error) {
      await reloadFiles();
      state.error = messageOf(error, "Could not delete file");
    }
  });

  const pasteFile = $(async () => {
    const source = state.files.find((file) => file.id === state.clipboardId);
    if (
      !source ||
      !isValidVaultPaste(state.currentFolderId, source.id, state.files)
    ) {
      return;
    }
    const parentId = state.currentFolderId;
    if (state.isCut) {
      state.files = state.files.map((file) =>
        file.id === source.id ? { ...file, parent_id: parentId } : file,
      );
      state.clipboardId = "";
      state.isCut = false;
      try {
        const { token, userId } = await requireToken();
        await updateVaultFile(token, userId, source.id, { parent_id: parentId });
        state.error = "";
      } catch (error) {
        await reloadFiles();
        state.error = messageOf(error, "Could not move file");
      }
      return;
    }
    try {
      const { token, userId } = await requireToken();
      const copies = await copyVaultTree(
        token,
        userId,
        source,
        parentId,
        state.files,
      );
      state.files = [...copies, ...state.files];
      state.error = "";
    } catch (error) {
      await reloadFiles();
      state.error = messageOf(error, "Could not paste file");
    }
  });

  const saveRename = $(async () => {
    const id = state.renameId;
    const name = state.renameText.trim();
    if (!id || !name) return;
    state.files = state.files.map((file) =>
      file.id === id ? { ...file, file_name: name } : file,
    );
    state.renameId = "";
    try {
      const { token, userId } = await requireToken();
      await updateVaultFile(token, userId, id, { file_name: name });
      state.error = "";
    } catch (error) {
      await reloadFiles();
      state.error = messageOf(error, "Could not rename file");
    }
  });

  if (state.authLoading) {
    return (
      <main class="app">
        <p class="status">Loading...</p>
      </main>
    );
  }

  if (!state.userId) {
    return (
      <main class="app">
        <p class="status">
          Please{" "}
          <Link
            href="/todos"
            style={{ color: "inherit", textDecoration: "underline" }}
          >
            login
          </Link>{" "}
          to view your vault.
        </p>
      </main>
    );
  }

  const currentFolder = state.files.find(
    (file) => file.id === state.currentFolderId,
  );
  const visibleFiles = displayVaultFiles(state.files, state.currentFolderId);
  const clipboard = state.files.find((file) => file.id === state.clipboardId);
  const canPaste =
    !!clipboard &&
    isValidVaultPaste(state.currentFolderId, clipboard.id, state.files);

  return (
    <main class="app">
      <header class="topbar">
        <div class="row">
          {state.currentFolderId && (
            <button
              type="button"
              class="tool"
              aria-label="Back"
              onClick$={() => {
                state.currentFolderId = currentFolder?.parent_id || "";
              }}
            >
              ←
            </button>
          )}
          <h1>{currentFolder?.file_name || "Vault"}</h1>
        </div>
        <div class="actions">
          <Link
            href="/todos"
            class="btn gray"
            style={{ textDecoration: "none", display: "inline-block" }}
          >
            Go to Todos
          </Link>
          {state.isEditMode && clipboard && (
            <button
              type="button"
              class="btn"
              disabled={!canPaste}
              onClick$={pasteFile}
            >
              Paste
            </button>
          )}
          <button
            type="button"
            class="tool"
            onClick$={() => {
              state.isEditMode = !state.isEditMode;
              if (!state.isEditMode) {
                state.clipboardId = "";
                state.isCut = false;
                state.renameId = "";
              }
            }}
          >
            {state.isEditMode ? "Done" : "Edit"}
          </button>
          <button type="button" class="btn gray" onClick$={handleSignOut}>
            Sign Out
          </button>
        </div>
      </header>

      {state.error && <p class="error">{state.error}</p>}

      <div
        class="composer"
        style={{ flexDirection: "column", alignItems: "stretch", gap: "8px" }}
      >
        <input
          id="file-upload"
          type="file"
          class="field"
          accept="image/*,application/pdf,.doc,.docx,.txt"
          onChange$={handleFileSelect}
        />
        {state.newData && (
          <div class="actions" style={{ justifyContent: "flex-start" }}>
            <button
              type="button"
              class="btn"
              disabled={state.isUploading}
              onClick$={handleUploadFile}
            >
              {state.isUploading ? "Uploading..." : "Save to Vault"}
            </button>
          </div>
        )}
      </div>

      {state.isEditMode && (
        <div class="composer">
          <input
            value={state.newFolderName}
            placeholder="New folder name..."
            aria-label="New folder name"
            onInput$={(_, element) => {
              state.newFolderName = element.value;
            }}
            onKeyDown$={(event) => {
              if (event.key === "Enter") void handleCreateFolder();
            }}
          />
          <button
            type="button"
            class="btn green"
            disabled={!state.newFolderName.trim()}
            onClick$={handleCreateFolder}
          >
            Add Folder
          </button>
        </div>
      )}

      {state.loadingFiles && state.files.length === 0 && (
        <p class="status">Loading files...</p>
      )}

      {visibleFiles.length === 0 && !state.loadingFiles && (
        <p class="hint">Nothing in this folder yet.</p>
      )}

      <div class="list">
        {visibleFiles.map((file, index) => (
          <article
            class={state.isCut && state.clipboardId === file.id ? "card cut" : "card"}
            key={file.id}
            style={{ display: "flex", flexDirection: "column", gap: "8px" }}
          >
            <button
              type="button"
              class="task-button"
              style={{ fontWeight: 700, fontSize: "0.95rem", wordBreak: "break-all" }}
              onClick$={() => {
                if (file.type === "FOLDER") state.currentFolderId = file.id;
              }}
            >
              {file.type === "FOLDER" ? "📁 " : ""}
              {file.file_name}
            </button>

            {file.type !== "FOLDER" && (
              <>
                {file.mime_type.startsWith("image/") ? (
                  <img
                    src={file.data}
                    alt={file.file_name}
                    width={640}
                    height={300}
                    style={{
                      width: "100%",
                      height: "auto",
                      maxHeight: "300px",
                      objectFit: "contain",
                      borderRadius: "6px",
                      backgroundColor: "#f4f4f4",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      padding: "12px",
                      background: "#f4f4f4",
                      borderRadius: "6px",
                      border: "1px dashed #ccc",
                    }}
                  >
                    <p style={{ margin: 0, fontSize: "0.85rem", color: "#555" }}>
                      📄 Document ({file.mime_type || "file"})
                    </p>
                  </div>
                )}
                <div>
                  <a
                    href={file.data}
                    download={file.file_name}
                    class="btn"
                    style={{
                      textDecoration: "none",
                      display: "inline-block",
                      padding: "8px 12px",
                    }}
                  >
                    Download File
                  </a>
                </div>
              </>
            )}

            {state.renameId === file.id && (
              <div class="composer">
                <input
                  value={state.renameText}
                  aria-label="Rename"
                  onInput$={(_, element) => {
                    state.renameText = element.value;
                  }}
                  onKeyDown$={(event) => {
                    if (event.key === "Enter") void saveRename();
                  }}
                />
                <button type="button" class="btn" onClick$={saveRename}>
                  Save
                </button>
                <button
                  type="button"
                  class="btn gray"
                  onClick$={() => {
                    state.renameId = "";
                  }}
                >
                  Cancel
                </button>
              </div>
            )}

            {state.isEditMode && (
              <div class="edit-tools">
                <button
                  type="button"
                  class="tool"
                  disabled={index === 0}
                  aria-label="Move up"
                  onClick$={() => moveFile(file.id, "up")}
                >
                  ↑
                </button>
                <button
                  type="button"
                  class="tool"
                  disabled={index === visibleFiles.length - 1}
                  aria-label="Move down"
                  onClick$={() => moveFile(file.id, "down")}
                >
                  ↓
                </button>
                <button
                  type="button"
                  class="tool"
                  onClick$={() => {
                    state.renameId = file.id;
                    state.renameText = file.file_name;
                  }}
                >
                  Rename
                </button>
                <button
                  type="button"
                  class="tool"
                  onClick$={() => {
                    state.clipboardId = file.id;
                    state.isCut = true;
                  }}
                >
                  Cut
                </button>
                <button
                  type="button"
                  class="tool"
                  onClick$={() => {
                    state.clipboardId = file.id;
                    state.isCut = false;
                  }}
                >
                  Copy
                </button>
                <button
                  type="button"
                  class="btn danger"
                  onClick$={() => handleDeleteFile(file.id)}
                >
                  Delete
                </button>
              </div>
            )}

            <div style={{ fontSize: "0.75rem", color: "#888", textAlign: "right" }}>
              {file.created_at ? new Date(file.created_at).toLocaleString() : ""}
            </div>
          </article>
        ))}
      </div>
    </main>
  );
});

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () =>
      reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

async function copyVaultTree(
  token: string,
  userId: string,
  source: VaultFile,
  parentId: string,
  all: readonly VaultFile[],
): Promise<VaultFile[]> {
  const created = await createVaultFile(token, userId, {
    parent_id: parentId,
    type: source.type === "FOLDER" ? "FOLDER" : "FILE",
    file_name: source.file_name,
    mime_type: source.type === "FOLDER" ? "" : source.mime_type,
    data: source.type === "FOLDER" ? "" : source.data,
    timestamp: Date.now(),
  });
  const copies = [created];
  if (source.type === "FOLDER") {
    const children = all
      .filter((file) => file.parent_id === source.id)
      .sort((a, b) => a.timestamp - b.timestamp);
    for (const child of children) {
      copies.push(
        ...(await copyVaultTree(token, userId, child, created.id, all)),
      );
    }
  }
  return copies;
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export const head: DocumentHead = {
  title: "File Vault",
  meta: [
    {
      name: "description",
      content: "Folders, files, and downloads synced with the Android app.",
    },
  ],
};
