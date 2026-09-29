import { component$, useStore, useVisibleTask$, $ } from "@builder.io/qwik";
import { type DocumentHead, Link, useNavigate } from "@builder.io/qwik-city";
import {
  getVaultFiles,
  createVaultFile,
  deleteVaultFile,
  type VaultFile,
} from "../../api";
import { requireToken, watchAuth, signOutCurrent } from "../../firebase";

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
}

export default component$(() => {
  // The login and Todos links render after auth, in the browser. Read the
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
  });

  const reloadFiles = $(async () => {
    state.loadingFiles = true;
    try {
      const { token, userId } = await requireToken();
      state.files = await getVaultFiles(token, userId);
      state.error = "";
    } catch (error) {
      state.error =
        error instanceof Error && error.message
          ? error.message
          : "Could not load files";
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
        file_name: state.newFileName,
        mime_type: state.newMimeType,
        data: state.newData,
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
      state.error =
        error instanceof Error && error.message
          ? error.message
          : "Could not save file";
    } finally {
      state.isUploading = false;
    }
  });

  const handleSignOut = $(async () => {
    state.error = "";
    try {
      await signOutCurrent();
    } catch (error) {
      state.error =
        error instanceof Error && error.message
          ? error.message
          : "Could not sign out";
    }
  });

  const handleDeleteFile = $(async (id: string) => {
    try {
      const { token, userId } = await requireToken();
      await deleteVaultFile(token, userId, id);
      state.files = state.files.filter((item) => item.id !== id);
      state.error = "";
    } catch (error) {
      state.error =
        error instanceof Error && error.message
          ? error.message
          : "Could not delete file";
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

  return (
    <main class="app">
      <header class="topbar">
        <div class="row">
          <h1>My File Vault</h1>
        </div>
        <div class="actions">
          <Link
            href="/todos"
            class="btn gray"
            style={{ textDecoration: "none", display: "inline-block" }}
          >
            Go to Todos
          </Link>
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
          <div
            class="actions"
            style={{ justifyContent: "flex-start", marginTop: "8px" }}
          >
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

      {state.loadingFiles && state.files.length === 0 && (
        <p class="status">Loading files...</p>
      )}

      {state.files.length === 0 && !state.loadingFiles && (
        <p class="hint">No files in your vault yet.</p>
      )}

      <div class="list">
        {state.files.map((file) => (
          <article
            class="card"
            key={file.id}
            style={{ display: "flex", flexDirection: "column", gap: "8px" }}
          >
            <div
              class="row"
              style={{
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <span
                style={{
                  fontSize: "0.95rem",
                  fontWeight: "bold",
                  wordBreak: "break-all",
                }}
              >
                {file.file_name}
              </span>
              <button
                type="button"
                class="btn danger"
                style={{
                  padding: "4px 8px",
                  fontSize: "0.85rem",
                  flexShrink: 0,
                }}
                onClick$={() => handleDeleteFile(file.id)}
              >
                Delete
              </button>
            </div>

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
                <p
                  style={{
                    margin: "0 0 12px 0",
                    fontSize: "0.85rem",
                    color: "#555",
                  }}
                >
                  📄 Document ({file.mime_type})
                </p>
                <a
                  href={file.data}
                  download={file.file_name}
                  class="btn"
                  style={{ textDecoration: "none", display: "inline-block" }}
                >
                  Download File
                </a>
              </div>
            )}

            <div
              style={{ fontSize: "0.75rem", color: "#888", textAlign: "right" }}
            >
              {file.created_at
                ? new Date(file.created_at).toLocaleString()
                : ""}
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

export const head: DocumentHead = {
  title: "File Vault",
  meta: [
    {
      name: "description",
      content: "Securely store and view your photos and documents.",
    },
  ],
};
