import { LitElement, html } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import "./components/baseComponents/Button";
import "./components/baseComponents/Modal";

@customElement("add-friend-modal")
export class AddFriendModal extends LitElement {
  @query("o-modal") private modalEl!: HTMLElement & {
    open(): void;
    close(): void;
  };
  @state() private friendName = "";

  createRenderRoot() {
    return this; // light DOM for Tailwind
  }

  public open() {
    this.modalEl?.open();
  }

  public close() {
    this.modalEl?.close();
  }

  private handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    this.friendName = target.value;
  }

  private async handleAdd() {
    const name = this.friendName.trim();
    if (!name) return;
    try {
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        console.error("Failed to add friend");
      }
    } catch (err) {
      console.error("Failed to add friend", err);
    }
    this.friendName = "";
    this.close();
  }

  render() {
    return html`
      <o-modal translationKey="main.add_friend">
        <div class="flex flex-col gap-2">
          <input
            type="text"
            class="w-full px-3 py-2 border rounded"
            placeholder="Friend username"
            .value=${this.friendName}
            @input=${this.handleInput}
          />
          <o-button
            translationKey="main.add_friend"
            @click=${this.handleAdd}
            block
          ></o-button>
        </div>
      </o-modal>
    `;
  }
}
