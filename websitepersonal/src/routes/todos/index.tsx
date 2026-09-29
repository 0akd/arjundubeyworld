import {
  $,
  component$,
  useSignal,
  useStore,
  useVisibleTask$,
  type QRL,
} from "@builder.io/qwik";
import { type DocumentHead } from "@builder.io/qwik-city";
import {
  createTodo,
  deleteTodo,
  getTodos,
  updateTodo,
  type Todo,
  type TodoPatch,
} from "../../api";
import { WebWhiteboard } from "../../components/whiteboard";
import {
  loginWithEmail,
  requireToken,
  signOutCurrent,
  signUpWithEmail,
  watchAuth,
} from "../../firebase";
import {
  collectDeleteOrder,
  displayTodos,
  duplicateTree,
  isValidPaste,
  reorderTimestamps,
} from "../../todo-tree";

interface AppState {
  authLoading: boolean;
  userId: string;
  error: string;
  loadingTodos: boolean;
  todos: Todo[];
  currentFolderId: string;
  editMode: boolean;
  clipboardId: string;
  cut: boolean;
  stepsId: string;
  whiteboardId: string;
  renameId: string;
  newTask: string;
}

export default component$(() => {
  const email = useSignal("");
  const password = useSignal("");
  const authBusy = useSignal(false);
  const state = useStore<AppState>({
    authLoading: true,
    userId: "",
    error: "",
    loadingTodos: false,
    todos: [],
    currentFolderId: "",
    editMode: false,
    clipboardId: "",
    cut: false,
    stepsId: "",
    whiteboardId: "",
    renameId: "",
    newTask: "",
  });

  const reloadTodos = $(async () => {
    state.loadingTodos = true;
    try {
      const { token, userId } = await requireToken();
      state.todos = await getTodos(token, userId);
      state.error = "";
      if (
        state.currentFolderId &&
        !state.todos.some((todo) => todo.id === state.currentFolderId)
      ) {
        state.currentFolderId = "";
      }
      if (
        state.whiteboardId &&
        !state.todos.some((todo) => todo.id === state.whiteboardId)
      ) {
        state.whiteboardId = "";
      }
      if (
        state.stepsId &&
        !state.todos.some((todo) => todo.id === state.stepsId)
      )
        state.stepsId = "";
      if (
        state.renameId &&
        !state.todos.some((todo) => todo.id === state.renameId)
      )
        state.renameId = "";
      if (
        state.clipboardId &&
        !state.todos.some((todo) => todo.id === state.clipboardId)
      ) {
        state.clipboardId = "";
        state.cut = false;
      }
    } catch (error) {
      state.error = messageOf(error, "Could not load tasks");
    } finally {
      state.loadingTodos = false;
    }
  });

  const savePatch = $(async (id: string, patch: TodoPatch) => {
    try {
      const { token, userId } = await requireToken();
      await updateTodo(token, userId, id, patch);
      state.error = "";
    } catch (error) {
      await reloadTodos();
      state.error = messageOf(error, "Could not save changes");
      throw error;
    }
  });

  // Firebase Auth is browser-only, so this cannot run inside useTask$ during SSR.
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => {
    const unsubscribe = watchAuth((userId) => {
      state.userId = userId ?? "";
      state.authLoading = false;
      if (!userId) {
        state.todos = [];
        state.currentFolderId = "";
        state.clipboardId = "";
        state.cut = false;
        state.editMode = false;
        state.stepsId = "";
        state.whiteboardId = "";
        state.renameId = "";
        state.loadingTodos = false;
        return;
      }
      void reloadTodos();
    });
    cleanup(unsubscribe);
  });

  const handleAuth = $(async (signUp: boolean) => {
    if (!email.value.trim() || !password.value.trim()) {
      state.error = "Please enter email and password";
      return;
    }
    authBusy.value = true;
    state.error = "";
    try {
      if (signUp) await signUpWithEmail(email.value, password.value);
      else await loginWithEmail(email.value, password.value);
    } catch (error) {
      state.error = messageOf(error, "Could not sign in");
    } finally {
      authBusy.value = false;
    }
  });

  const handleLogout = $(async () => {
    state.error = "";
    try {
      await signOutCurrent();
    } catch (error) {
      state.error = messageOf(error, "Could not sign out");
    }
  });

  const addNode = $(async (type: "TODO" | "FOLDER") => {
    const task = state.newTask;
    if (!task.trim() || !state.userId) return;
    const todo: Todo = {
      id: crypto.randomUUID(),
      parentId: state.currentFolderId,
      type,
      task,
      isCompleted: false,
      timestamp: Date.now(),
      steps: [],
      whiteboardJson: "",
    };
    state.todos = [...state.todos, todo];
    state.newTask = "";
    try {
      const { token, userId } = await requireToken();
      await createTodo(token, userId, todo);
      state.error = "";
    } catch (error) {
      await reloadTodos();
      state.error = messageOf(error, "Could not save changes");
    }
  });

  const toggleNode = $(async (id: string, isCompleted: boolean) => {
    state.todos = state.todos.map((todo) =>
      todo.id === id ? { ...todo, isCompleted } : todo,
    );
    try {
      await savePatch(id, { isCompleted });
    } catch {
      // savePatch reloads and records the error.
    }
  });

  const moveNode = $(async (id: string, direction: "up" | "down") => {
    const visible = displayTodos(state.todos, state.currentFolderId);
    const index = visible.findIndex((todo) => todo.id === id);
    const neighbor = visible[direction === "up" ? index - 1 : index + 1];
    const node = visible[index];
    if (!node || !neighbor) return;
    const next = reorderTimestamps(
      node.timestamp,
      neighbor.timestamp,
      direction,
    );
    state.todos = state.todos.map((todo) => {
      if (todo.id === node.id) return { ...todo, timestamp: next.current };
      if (todo.id === neighbor.id) return { ...todo, timestamp: next.neighbor };
      return todo;
    });
    try {
      const { token, userId } = await requireToken();
      await updateTodo(token, userId, node.id, { timestamp: next.current });
      await updateTodo(token, userId, neighbor.id, {
        timestamp: next.neighbor,
      });
      state.error = "";
    } catch (error) {
      await reloadTodos();
      state.error = messageOf(error, "Could not save changes");
    }
  });

  const removeNode = $(async (id: string) => {
    const ids = collectDeleteOrder(id, state.todos);
    const remove = new Set(ids);
    state.todos = state.todos.filter((todo) => !remove.has(todo.id));
    if (remove.has(state.clipboardId)) {
      state.clipboardId = "";
      state.cut = false;
    }
    try {
      const { token, userId } = await requireToken();
      for (const todoId of ids) await deleteTodo(token, userId, todoId);
      state.error = "";
    } catch (error) {
      await reloadTodos();
      state.error = messageOf(error, "Could not save changes");
    }
  });

  const paste = $(async () => {
    const source = state.todos.find((todo) => todo.id === state.clipboardId);
    if (!source || !isValidPaste(state.currentFolderId, source.id, state.todos))
      return;
    const parentId = state.currentFolderId;
    if (state.cut) {
      state.todos = state.todos.map((todo) =>
        todo.id === source.id ? { ...todo, parentId } : todo,
      );
      state.clipboardId = "";
      state.cut = false;
      try {
        await savePatch(source.id, { parentId });
      } catch {
        // savePatch reloads and records the error.
      }
      return;
    }
    const copies = duplicateTree(source, parentId, state.todos);
    state.todos = [...state.todos, ...copies];
    try {
      const { token, userId } = await requireToken();
      for (const copy of copies) await createTodo(token, userId, copy);
      state.error = "";
    } catch (error) {
      await reloadTodos();
      state.error = messageOf(error, "Could not save changes");
    }
  });

  const renameNode = $(async (id: string, task: string) => {
    if (!task.trim()) return;
    state.todos = state.todos.map((todo) =>
      todo.id === id ? { ...todo, task } : todo,
    );
    state.renameId = "";
    try {
      await savePatch(id, { task });
    } catch {
      // savePatch reloads and records the error.
    }
  });

  const updateSteps = $(async (steps: string[]) => {
    const id = state.stepsId;
    if (!id) return;
    state.todos = state.todos.map((todo) =>
      todo.id === id ? { ...todo, steps } : todo,
    );
    try {
      await savePatch(id, { steps });
    } catch {
      // savePatch reloads and records the error.
    }
  });

  const saveWhiteboard = $(async (json: string) => {
    const id = state.whiteboardId;
    if (!id) return;
    state.todos = state.todos.map((todo) =>
      todo.id === id ? { ...todo, whiteboardJson: json } : todo,
    );
    await savePatch(id, { whiteboardJson: json });
  });

  const closeWhiteboard = $(() => {
    state.whiteboardId = "";
  });

  const openNode = $((id: string) => {
    const todo = state.todos.find((item) => item.id === id);
    if (!todo) return;
    if (todo.type === "FOLDER") state.currentFolderId = id;
    else state.stepsId = id;
  });

  const openWhiteboard = $((id: string) => {
    const todo = state.todos.find((item) => item.id === id);
    if (!todo || todo.type !== "TODO") return;
    state.stepsId = "";
    state.whiteboardId = id;
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
      <form
        class="auth-card"
        preventdefault:submit
        onSubmit$={() => handleAuth(false)}
      >
        <h1>Login to Todos</h1>
        <input
          class="field"
          type="email"
          placeholder="Email"
          autoComplete="username"
          bind:value={email}
        />
        <input
          class="field"
          type="password"
          placeholder="Password"
          autoComplete="current-password"
          bind:value={password}
        />
        {state.error && <p class="error">{state.error}</p>}
        <div class="row">
          <button type="submit" class="btn" disabled={authBusy.value}>
            Login
          </button>
          <button
            type="button"
            class="btn gray"
            disabled={authBusy.value}
            onClick$={() => handleAuth(true)}
          >
            Sign Up
          </button>
        </div>
      </form>
    );
  }

  const currentFolder = state.todos.find(
    (todo) => todo.id === state.currentFolderId,
  );
  const visible = displayTodos(state.todos, state.currentFolderId);
  const clipboard = state.todos.find((todo) => todo.id === state.clipboardId);
  const canPaste =
    !!clipboard &&
    isValidPaste(state.currentFolderId, clipboard.id, state.todos);
  const stepsTodo = state.todos.find((todo) => todo.id === state.stepsId);
  const renameTodo = state.todos.find((todo) => todo.id === state.renameId);
  const whiteboardTodo = state.todos.find(
    (todo) => todo.id === state.whiteboardId,
  );

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
                state.currentFolderId = currentFolder?.parentId || "";
              }}
            >
              ←
            </button>
          )}
          <h1>{currentFolder?.task || "My Tasks"}</h1>
        </div>
        <div class="actions">
          {state.editMode && clipboard && (
            <button
              type="button"
              class="btn"
              disabled={!canPaste}
              onClick$={paste}
            >
              Paste
            </button>
          )}
          <button
            type="button"
            class="tool"
            onClick$={() => {
              state.editMode = !state.editMode;
              if (!state.editMode) {
                state.clipboardId = "";
                state.cut = false;
              }
            }}
          >
            {state.editMode ? "Done" : "Edit"}
          </button>
          <button type="button" class="btn gray" onClick$={handleLogout}>
            Sign Out
          </button>
        </div>
      </header>

      {state.error && <p class="error">{state.error}</p>}
      {state.loadingTodos && state.todos.length === 0 && (
        <p class="status">Loading tasks...</p>
      )}
      <p class="hint">Hold or double-click a task to open its whiteboard.</p>

      {state.editMode && (
        <div class="composer">
          <input
            value={state.newTask}
            placeholder="New item..."
            aria-label="New item"
            onInput$={(_, element) => {
              state.newTask = element.value;
            }}
            onKeyDown$={(event) => {
              if (event.key === "Enter") void addNode("TODO");
            }}
          />
          <button
            type="button"
            class="btn"
            disabled={!state.newTask.trim()}
            onClick$={() => addNode("TODO")}
          >
            Task
          </button>
          <button
            type="button"
            class="btn green"
            disabled={!state.newTask.trim()}
            onClick$={() => addNode("FOLDER")}
          >
            Folder
          </button>
        </div>
      )}

      {visible.length === 0 && !state.loadingTodos && (
        <p class="hint">Nothing in this folder yet.</p>
      )}

      <div class="list">
        {visible.map((todo, index) => (
          <TodoCard
            key={todo.id}
            todo={todo}
            editMode={state.editMode}
            cut={state.cut && state.clipboardId === todo.id}
            canMoveUp={index > 0}
            canMoveDown={index < visible.length - 1}
            onOpen$={openNode}
            onWhiteboard$={openWhiteboard}
            onToggle$={toggleNode}
            onMove$={moveNode}
            onRename$={(id) => {
              state.renameId = id;
            }}
            onCut$={(id) => {
              state.clipboardId = id;
              state.cut = true;
            }}
            onCopy$={(id) => {
              state.clipboardId = id;
              state.cut = false;
            }}
            onDelete$={removeNode}
          />
        ))}
      </div>

      {stepsTodo && (
        <StepsDialog
          key={stepsTodo.id}
          todo={stepsTodo}
          editMode={state.editMode}
          onClose$={() => {
            state.stepsId = "";
          }}
          onUpdate$={updateSteps}
        />
      )}

      {renameTodo && (
        <RenameDialog
          key={renameTodo.id}
          todo={renameTodo}
          onClose$={() => {
            state.renameId = "";
          }}
          onSave$={renameNode}
        />
      )}

      {whiteboardTodo && (
        <WebWhiteboard
          key={whiteboardTodo.id}
          todoId={whiteboardTodo.id}
          title={whiteboardTodo.task}
          json={whiteboardTodo.whiteboardJson}
          notice={state.error}
          onClose$={closeWhiteboard}
          onSave$={saveWhiteboard}
        />
      )}
    </main>
  );
});

interface CardProps {
  todo: Todo;
  editMode: boolean;
  cut: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onOpen$: QRL<(id: string) => void>;
  onWhiteboard$: QRL<(id: string) => void>;
  onToggle$: QRL<(id: string, isCompleted: boolean) => void>;
  onMove$: QRL<(id: string, direction: "up" | "down") => void>;
  onRename$: QRL<(id: string) => void>;
  onCut$: QRL<(id: string) => void>;
  onCopy$: QRL<(id: string) => void>;
  onDelete$: QRL<(id: string) => void>;
}

const TodoCard = component$((props: CardProps) => {
  const press = useStore({ generation: 0, x: 0, y: 0, suppressClick: false });
  const openTimer = useSignal(0);

  // Clears a pending click timer if the card unmounts before it opens the task.
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => {
    cleanup(() => window.clearTimeout(openTimer.value));
  });

  return (
    <article class={props.cut ? "card cut" : "card"}>
      <div class="card-main">
        {props.todo.type === "TODO" ? (
          <input
            type="checkbox"
            checked={props.todo.isCompleted}
            disabled={props.editMode}
            aria-label={`Complete ${props.todo.task}`}
            onClick$={(event) => event.stopPropagation()}
            onChange$={(_, element) =>
              props.onToggle$(props.todo.id, element.checked)
            }
          />
        ) : (
          <span class="folder-icon" aria-hidden="true">
            📁
          </span>
        )}
        <button
          type="button"
          class="task-button"
          onPointerDown$={(event) => {
            if (props.todo.type !== "TODO") return;
            press.generation += 1;
            const generation = press.generation;
            press.x = event.clientX;
            press.y = event.clientY;
            window.setTimeout(() => {
              if (press.generation !== generation) return;
              press.suppressClick = true;
              void props.onWhiteboard$(props.todo.id);
            }, 600);
          }}
          onPointerMove$={(event) => {
            if (
              Math.hypot(event.clientX - press.x, event.clientY - press.y) > 12
            )
              press.generation += 1;
          }}
          onPointerUp$={() => {
            press.generation += 1;
          }}
          onPointerCancel$={() => {
            press.generation += 1;
          }}
          onClick$={(event) => {
            if (press.suppressClick) {
              press.suppressClick = false;
              return;
            }
            if (event.detail > 1) return;
            if (props.todo.type === "FOLDER") {
              void props.onOpen$(props.todo.id);
              return;
            }
            window.clearTimeout(openTimer.value);
            openTimer.value = window.setTimeout(() => {
              void props.onOpen$(props.todo.id);
            }, 250);
          }}
          onDblClick$={() => {
            window.clearTimeout(openTimer.value);
            if (props.todo.type === "TODO")
              void props.onWhiteboard$(props.todo.id);
          }}
        >
          <span class={props.todo.isCompleted ? "done" : undefined}>
            {props.todo.task}
          </span>
        </button>
      </div>
      {props.editMode && (
        <div class="edit-tools">
          <button
            type="button"
            class="tool"
            aria-label="Move up"
            disabled={!props.canMoveUp}
            onClick$={() => props.onMove$(props.todo.id, "up")}
          >
            ↑
          </button>
          <button
            type="button"
            class="tool"
            aria-label="Move down"
            disabled={!props.canMoveDown}
            onClick$={() => props.onMove$(props.todo.id, "down")}
          >
            ↓
          </button>
          <button
            type="button"
            class="tool"
            onClick$={() => props.onRename$(props.todo.id)}
          >
            Rename
          </button>
          <button
            type="button"
            class="tool"
            aria-label="Cut"
            onClick$={() => props.onCut$(props.todo.id)}
          >
            ✂
          </button>
          <button
            type="button"
            class="tool"
            aria-label="Copy"
            onClick$={() => props.onCopy$(props.todo.id)}
          >
            Copy
          </button>
          {props.todo.type === "TODO" && (
            <button
              type="button"
              class="tool"
              onClick$={() => props.onWhiteboard$(props.todo.id)}
            >
              Draw
            </button>
          )}
          <button
            type="button"
            class="btn danger"
            onClick$={() => props.onDelete$(props.todo.id)}
          >
            Delete
          </button>
        </div>
      )}
    </article>
  );
});

const StepsDialog = component$(
  (props: {
    todo: Todo;
    editMode: boolean;
    onClose$: QRL<() => void>;
    onUpdate$: QRL<(steps: string[]) => void>;
  }) => {
    const draft = useStore({
      newStep: "",
      editIndex: -1,
      editText: "",
      insertIndex: -1,
      insertText: "",
    });

    return (
      <>
        <div class="overlay">
          <section class="dialog" role="dialog" aria-label={props.todo.task}>
            <h2>{props.todo.task}</h2>
            {props.todo.steps.length === 0 && !props.editMode ? (
              <p class="hint">No steps added.</p>
            ) : (
              <ul class="step-list">
                {props.todo.steps.map((step, index) => (
                  <StepRow
                    key={`${index}-${step}`}
                    index={index}
                    step={step}
                    count={props.todo.steps.length}
                    editMode={props.editMode}
                    steps={props.todo.steps}
                    onUpdate$={props.onUpdate$}
                    onBeginEdit$={(stepIndex, value) => {
                      draft.editIndex = stepIndex;
                      draft.editText = value;
                    }}
                    onBeginInsert$={(stepIndex) => {
                      draft.insertIndex = stepIndex;
                      draft.insertText = "";
                    }}
                  />
                ))}
              </ul>
            )}
            {props.editMode && (
              <div class="composer">
                <input
                  value={draft.newStep}
                  placeholder="New step"
                  aria-label="New step"
                  onInput$={(_, element) => {
                    draft.newStep = element.value;
                  }}
                />
                <button
                  type="button"
                  class="btn"
                  disabled={!draft.newStep.trim()}
                  onClick$={() => {
                    if (!draft.newStep.trim()) return;
                    void props.onUpdate$([...props.todo.steps, draft.newStep]);
                    draft.newStep = "";
                  }}
                >
                  Add
                </button>
              </div>
            )}
            <div class="actions">
              <button type="button" class="btn" onClick$={props.onClose$}>
                Close
              </button>
            </div>
          </section>
        </div>
        {draft.editIndex >= 0 && (
          <div class="overlay">
            <form
              class="dialog"
              role="dialog"
              aria-label="Edit step"
              preventdefault:submit
              onSubmit$={() => {
                if (!draft.editText.trim() || draft.editIndex < 0) return;
                void props.onUpdate$(
                  replaceStep(
                    props.todo.steps,
                    draft.editIndex,
                    draft.editText,
                  ),
                );
                draft.editIndex = -1;
              }}
            >
              <h2>Edit Step</h2>
              <input
                value={draft.editText}
                aria-label="Step text"
                onInput$={(_, element) => {
                  draft.editText = element.value;
                }}
              />
              <div class="actions">
                <button
                  type="button"
                  class="tool"
                  onClick$={() => (draft.editIndex = -1)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  class="btn"
                  disabled={!draft.editText.trim()}
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        )}
        {draft.insertIndex >= 0 && (
          <div class="overlay">
            <form
              class="dialog"
              role="dialog"
              aria-label="Insert step"
              preventdefault:submit
              onSubmit$={() => {
                if (!draft.insertText.trim() || draft.insertIndex < 0) return;
                void props.onUpdate$(
                  insertStep(
                    props.todo.steps,
                    draft.insertIndex,
                    draft.insertText,
                  ),
                );
                draft.insertIndex = -1;
              }}
            >
              <h2>Insert Step</h2>
              <input
                value={draft.insertText}
                aria-label="Step text"
                onInput$={(_, element) => {
                  draft.insertText = element.value;
                }}
              />
              <div class="actions">
                <button
                  type="button"
                  class="tool"
                  onClick$={() => (draft.insertIndex = -1)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  class="btn"
                  disabled={!draft.insertText.trim()}
                >
                  Insert
                </button>
              </div>
            </form>
          </div>
        )}
      </>
    );
  },
);

const StepRow = component$(
  (props: {
    index: number;
    step: string;
    count: number;
    editMode: boolean;
    steps: string[];
    onUpdate$: QRL<(steps: string[]) => void>;
    onBeginEdit$: QRL<(index: number, value: string) => void>;
    onBeginInsert$: QRL<(index: number) => void>;
  }) => {
    return (
      <li>
        {props.editMode && props.index > 0 && (
          <button
            type="button"
            class="tool"
            onClick$={() => props.onBeginInsert$(props.index)}
          >
            Insert step here
          </button>
        )}
        <div class="step-row">
          <p>• {props.step}</p>
          {props.editMode && (
            <>
              <button
                type="button"
                class="tool"
                aria-label="Move step up"
                disabled={props.index === 0}
                onClick$={() =>
                  props.onUpdate$(swapStep(props.steps, props.index, -1))
                }
              >
                ↑
              </button>
              <button
                type="button"
                class="tool"
                aria-label="Move step down"
                disabled={props.index === props.count - 1}
                onClick$={() =>
                  props.onUpdate$(swapStep(props.steps, props.index, 1))
                }
              >
                ↓
              </button>
              <button
                type="button"
                class="tool"
                onClick$={() => props.onBeginEdit$(props.index, props.step)}
              >
                Edit
              </button>
              <button
                type="button"
                class="tool"
                onClick$={() =>
                  props.onUpdate$(
                    props.steps.filter(
                      (_, stepIndex) => stepIndex !== props.index,
                    ),
                  )
                }
              >
                Delete
              </button>
            </>
          )}
        </div>
      </li>
    );
  },
);

const RenameDialog = component$(
  (props: {
    todo: Todo;
    onClose$: QRL<() => void>;
    onSave$: QRL<(id: string, task: string) => void>;
  }) => {
    const text = useSignal(props.todo.task);
    return (
      <div class="overlay">
        <form
          class="dialog"
          role="dialog"
          aria-label={
            props.todo.type === "FOLDER" ? "Rename Folder" : "Rename Task"
          }
          preventdefault:submit
          onSubmit$={() => {
            if (!text.value.trim() || text.value === props.todo.task) return;
            void props.onSave$(props.todo.id, text.value);
          }}
        >
          <h2>
            {props.todo.type === "FOLDER" ? "Rename Folder" : "Rename Task"}
          </h2>
          <input
            class="field"
            aria-label="Name"
            value={text.value}
            onInput$={(_, element) => {
              text.value = element.value;
            }}
          />
          <div class="actions">
            <button type="button" class="tool" onClick$={props.onClose$}>
              Cancel
            </button>
            <button
              type="submit"
              class="btn"
              disabled={!text.value.trim() || text.value === props.todo.task}
            >
              Save
            </button>
          </div>
        </form>
      </div>
    );
  },
);

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function swapStep(
  steps: readonly string[],
  index: number,
  direction: -1 | 1,
): string[] {
  const next = index + direction;
  if (next < 0 || next >= steps.length) return [...steps];
  const copy = [...steps];
  const current = copy[index];
  copy[index] = copy[next];
  copy[next] = current;
  return copy;
}

function replaceStep(
  steps: readonly string[],
  index: number,
  text: string,
): string[] {
  return steps.map((step, stepIndex) => (stepIndex === index ? text : step));
}

function insertStep(
  steps: readonly string[],
  index: number,
  text: string,
): string[] {
  const copy = [...steps];
  copy.splice(index, 0, text);
  return copy;
}

export const head: DocumentHead = {
  title: "Todos",
  meta: [
    {
      name: "description",
      content: "Folders, steps, and whiteboards synced with the Android app.",
    },
  ],
};
