export interface MenuCallbacks {
  onStartPractice: (nickname: string) => void;
  onStartOnline: (nickname: string, roomCode: string) => void;
  onResumeGame?: () => void;
  onExitToMenu?: () => void;
}

export class MainMenu {
  private container: HTMLElement;
  private callbacks: MenuCallbacks;
  private pauseModalEl!: HTMLElement;
  private nicknameInputEl!: HTMLInputElement;
  private roomCodeInputEl!: HTMLInputElement;

  constructor(container: HTMLElement, callbacks: MenuCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.createElements();
  }

  private createElements(): void {
    this.container.innerHTML = `
      <div id="main-menu-view" class="menu-overlay">
        <div class="menu-card">
          <div class="menu-brand">
            <h1 class="game-title">VEYLCORE</h1>
            <p class="game-subtitle">2D Top-down Online PvP Arena Shooter</p>
            <div class="version-tag">Milestone 3 &bull; Phase 2 (Server Authoritative Single Room)</div>
          </div>

          <div class="menu-form">
            <div class="form-group">
              <label for="nickname-input">플레이어 닉네임</label>
              <input
                id="nickname-input"
                type="text"
                maxlength="16"
                placeholder="Operator"
                value="Player"
                autocomplete="off"
                spellcheck="false"
              />
            </div>

            <div class="form-group">
              <label for="room-code-input">온라인 방 코드 (P2)</label>
              <input
                id="room-code-input"
                type="text"
                maxlength="12"
                placeholder="room1"
                value="room1"
                autocomplete="off"
                spellcheck="false"
              />
            </div>

            <div class="button-group">
              <button id="btn-online" class="btn btn-primary">
                <span class="btn-icon">&blacktriangleright;</span>
                온라인 대전 참가 (P2 서버 권한)
              </button>

              <button id="btn-practice" class="btn btn-secondary">
                오프라인 연습 시작 (P1 모드)
              </button>
            </div>
          </div>

          <div class="menu-footer">
            <div class="feature-pills">
              <span class="pill">Cloudflare Durable Objects</span>
              <span class="pill">서버 30Hz 판정 & 15Hz 스냅샷</span>
              <span class="pill">멀티플레이어 동기화</span>
              <span class="pill">안티 치트 입력 버퍼</span>
            </div>
          </div>
        </div>
      </div>

      <!-- ESC Pause Modal -->
      <div id="pause-modal" class="modal-overlay" style="display: none;">
        <div class="modal-card">
          <h2>일시 정지</h2>
          <p>게임이 일시 정지되었습니다.</p>
          <div class="modal-actions">
            <button id="btn-resume" class="btn btn-primary">계속하기 (Esc)</button>
            <button id="btn-quit" class="btn btn-danger">메인 메뉴로 나가기</button>
          </div>
        </div>
      </div>
    `;

    this.nicknameInputEl = document.getElementById("nickname-input") as HTMLInputElement;
    this.roomCodeInputEl = document.getElementById("room-code-input") as HTMLInputElement;
    this.pauseModalEl = document.getElementById("pause-modal")!;

    // Event listeners
    document.getElementById("btn-online")?.addEventListener("click", () => {
      const nick = this.nicknameInputEl.value.trim() || "Player";
      const room = this.roomCodeInputEl.value.trim() || "room1";
      this.callbacks.onStartOnline(nick, room);
    });

    document.getElementById("btn-practice")?.addEventListener("click", () => {
      const nick = this.nicknameInputEl.value.trim() || "Player";
      this.callbacks.onStartPractice(nick);
    });

    document.getElementById("btn-resume")?.addEventListener("click", () => {
      this.hidePauseModal();
      this.callbacks.onResumeGame?.();
    });

    document.getElementById("btn-quit")?.addEventListener("click", () => {
      this.hidePauseModal();
      this.showMainMenu();
      this.callbacks.onExitToMenu?.();
    });
  }

  public showMainMenu(): void {
    const mainView = document.getElementById("main-menu-view");
    if (mainView) mainView.style.display = "flex";
  }

  public hideMainMenu(): void {
    const mainView = document.getElementById("main-menu-view");
    if (mainView) mainView.style.display = "none";
  }

  public showPauseModal(): void {
    this.pauseModalEl.style.display = "flex";
  }

  public hidePauseModal(): void {
    this.pauseModalEl.style.display = "none";
  }

  public isPauseModalOpen(): boolean {
    return this.pauseModalEl.style.display === "flex";
  }
}
