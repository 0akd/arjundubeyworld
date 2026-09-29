import { component$ } from "@builder.io/qwik";
import { Link, type DocumentHead } from "@builder.io/qwik-city";

export default component$(() => {
  return (
    <main class="landing">
      <h1>Arjun's Todo App</h1>
      <p>
        The ultimate productivity tool, seamlessly synced across Web and
        Android.
      </p>
      <Link class="btn" href="/todos">
        Go to My Todos
      </Link>
    </main>
  );
});

export const head: DocumentHead = {
  title: "Arjun's Todo App",
  meta: [
    {
      name: "description",
      content:
        "Todos, folders, steps, and whiteboards synced with the Android app.",
    },
  ],
};
