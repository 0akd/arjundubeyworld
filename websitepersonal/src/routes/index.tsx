import { component$ } from "@builder.io/qwik";
import { Link, type DocumentHead } from "@builder.io/qwik-city";

export default component$(() => {
  return (
    <main class="landing">
      <h1>Arjun's Productivity Suite</h1>
      <p>Log in or Sign up to access your Workspace.</p>
      <div class="auth-box">
        <Link class="btn" href="/todos">
          Login / Go to Todos
        </Link>
        <Link class="btn outline" href="/vault">
          Login / Go to Vault
        </Link>
      </div>
    </main>
  );
});

export const head: DocumentHead = {
  title: "Arjun's Productivity Suite",
  meta: [
    {
      name: "description",
      content: "Todos and a file vault, synced across web and Android.",
    },
  ],
};
