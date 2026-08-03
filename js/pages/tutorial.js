import { goBack } from '../router.js';
import { ICON, haptic } from '../utils.js';

export function render(root) {
  root.innerHTML = `
    <div class="tutorial-container">

      <!-- 星图网格背景 -->
      <div class="star-grid-bg">
        <svg
          class="constellation-svg"
          viewBox="0 0 400 800"
          xmlns="http://www.w3.org/2000/svg"
        >
          <!-- 星轨线 1 -->
          <path
            class="orbit-path path-1"
            d="M-50,300 Q150,250 450,400"
            fill="none"
            stroke="var(--color-accent)"
            stroke-width="0.5"
            opacity="0.15"
          />

          <!-- 星群 1 -->
          <g class="constellation-group group-1">
            <line
              class="constellation-line"
              x1="80"
              y1="180"
              x2="200"
              y2="120"
              stroke="var(--color-accent)"
              stroke-width="0.5"
              opacity="0.3"
              stroke-dasharray="2,4"
            />
            <line
              class="constellation-line"
              x1="200"
              y1="120"
              x2="320"
              y2="220"
              stroke="var(--color-accent)"
              stroke-width="0.5"
              opacity="0.3"
              stroke-dasharray="2,4"
            />

            <circle
              class="twinkle-star"
              cx="80"
              cy="180"
              r="2"
              fill="var(--color-accent)"
              opacity="0.6"
            />
            <circle
              class="twinkle-star"
              cx="200"
              cy="120"
              r="3"
              fill="var(--color-accent)"
              opacity="0.8"
            />
            <circle
              class="twinkle-star"
              cx="320"
              cy="220"
              r="1.5"
              fill="var(--color-accent)"
              opacity="0.5"
            />
          </g>

          <!-- 星轨线 2 -->
          <path
            class="orbit-path path-2"
            d="M-50,600 Q250,650 450,550"
            fill="none"
            stroke="var(--color-accent)"
            stroke-width="0.5"
            opacity="0.15"
          />

          <!-- 星群 2 -->
          <g class="constellation-group group-2">
            <line
              class="constellation-line"
              x1="100"
              y1="450"
              x2="180"
              y2="520"
              stroke="var(--color-accent)"
              stroke-width="0.5"
              opacity="0.3"
            />
            <line
              class="constellation-line"
              x1="180"
              y1="520"
              x2="300"
              y2="480"
              stroke="var(--color-accent)"
              stroke-width="0.5"
              opacity="0.3"
            />

            <circle
              class="twinkle-star"
              cx="100"
              cy="450"
              r="2"
              fill="var(--color-accent)"
              opacity="0.7"
            />
            <circle
              class="twinkle-star"
              cx="180"
              cy="520"
              r="2.5"
              fill="var(--color-accent)"
              opacity="0.9"
            />
            <circle
              class="twinkle-star"
              cx="300"
              cy="480"
              r="2"
              fill="var(--color-accent)"
              opacity="0.6"
            />
          </g>
        </svg>
      </div>

      <!-- 顶栏 -->
      <div class="tutorial-top-bar">
        <button
          class="tut-btn-circle"
          id="tut-back"
          aria-label="返回"
        >
          ${ICON.back}
        </button>

        <span class="tut-title">星 图 指 引</span>

        <div style="width: 40px;"></div>
      </div>

      <!-- 手账主体 -->
      <div class="tutorial-scroll-body">

        <header class="tut-header">
          <h1 class="tut-main-title">L U N A R &nbsp; G U I D E</h1>
          <p class="tut-subtitle">恋恋不忘，必有回响</p>

          <div class="tut-divider">
            <span class="divider-diamond">✦</span>
          </div>
        </header>

        <!-- 板块一 -->
        <section class="tut-section">
          <div class="section-number">一</div>
          <h2 class="section-title">创 建 角 色 与 字 卡</h2>

          <div class="section-content">
            <p>
              在
              <span class="tut-highlight">Unrequited</span>
              的星域里，每个独立存在的灵魂都有其独特的信物。
            </p>

            <p>
              通过管理面板，你可以建立全新的角色。随后，为角色配置或导入专属的
              <span class="tut-highlight">字卡库</span>。
              字卡库支持通过 JSON 或纯文字导入。
            </p>

            <p>
              如果你的爱人没有专属字卡库，则可以使用通用字卡库与你进行对话。
              你还可以在字卡库中查看每张字卡被使用过的次数。
            </p>

            <p>
              你可以通过
              <span class="tut-highlight">草稿箱</span>
              功能，一次性编辑并发送多条信息给你的爱人。
              你的爱人也会在你不在的时候给你发送信息，或者在
              <span class="tut-highlight">想念箱</span>
              中留下一些思绪，让你知道 ta 想到了你。
            </p>

            <p>
              模拟
              <span class="tut-highlight">心跳语音通话</span>
              或许可以让你们之间的链接更加顺畅。
            </p>

            <p>
              <span class="tut-highlight">选择题模式</span>
              是为刚开始使用网站的小情侣准备的。
              你可以发送选择题，让对方在选项内进行回复，避免字卡过多时一时找不到合适的内容。
              同时，你也可以通过调节
              <span class="tut-highlight">回复时间</span>
              ，让你的爱人有更多时间去挑选字卡。
            </p>

            <p>
              如果你有多个爱人，可以通过新建对话框和新建角色，与他们同时发送消息。
            </p>

            <p>
              <span class="tut-highlight">静默模式</span>
              可以由你的爱人开启，也可以由你开启。
              但无论是谁启用了这个模式，你始终都可以将其关闭。
            </p>

            <p>
              启动静默模式后，你发送的消息不会立刻在爱人那边发出提醒。
              当你的爱人结束工作或忙碌之后，可以统一进行回复。
              这也是为了避免系统频繁帮助爱人回复信息而设计的功能。
            </p>

            <p>
              你可以在聊天窗口界面选择是否打开静默模式，按钮形状为月亮：
              空心月亮代表关闭，实心月亮代表开启。
              输入框旁边的四芒星按钮，则是
              <span class="tut-highlight">即刻回复</span>
              功能。
            </p>

            <p>
              你还可以在编辑角色区域编辑回复时间、拼接字卡以及是否主动发送消息等功能。
            </p>
          </div>
        </section>

        <!-- 板块二 -->
        <section class="tut-section">
          <div class="section-number">二</div>
          <h2 class="section-title">音 乐 播 放 器 & 片 刻 & 漂 流 瓶</h2>

          <div class="section-content">
            <p>
              <span class="tut-highlight">音乐播放器</span>
              可以直接在站内搜索音乐，并将音乐加入歌单。
              你的爱人可以与你共听，对乐曲进行评价，也可以切换歌曲。
            </p>

            <p>
              你也可以将音乐 URL 导入网站，与爱人一起听歌。
            </p>

            <p>
              <span class="tut-highlight">片刻</span>
              功能类似于“日常”。
              你可以在这里发送图片，爱人看到后可以通过贴小贴图留下评价。
            </p>

            <p>
              为了保护内存，图片具有保质期，过期后会被自动清理。
            </p>

            <p>
              <span class="tut-highlight">漂流瓶</span>
              是写给爱人的电子信件。
              你可以将想说的话写进漂流瓶，让它承载你的思念。
            </p>
          </div>
        </section>

        <!-- 板块三 -->
        <section class="tut-section">
          <div class="section-number">三</div>
          <h2 class="section-title">共 时 星 骰</h2>

          <div class="section-content">
            <p>
              迷茫的时刻，由非线性因果律支配的
              <span class="tut-highlight">共时星骰</span>
              会为你指出一条路。
            </p>

            <p>
              每次摇晃投掷，掷出的星骰面不仅代表当下的天体运行，
              更与你内心的潜意识共时关联。
            </p>

            <p>
              不要去寻找科学的答案。
              将星骰的图形、象征意义与当下的困惑重叠，
              你直觉感受到的第一个念头，就是宇宙给出的昭示。
            </p>

            <p>
              共时星骰并不具备固定的含义，
              你可以根据自己的理解和当下的感受去解读它。
            </p>
          </div>
        </section>

        <!-- 板块四 -->
        <section class="tut-section">
          <div class="section-number">四</div>
          <h2 class="section-title">占 卜</h2>

          <div class="section-content">
            <p>
              网站内置了
              <span class="tut-highlight">塔罗</span>、
              <span class="tut-highlight">雷诺曼</span>、
              <span class="tut-highlight">占星骰子</span>
              的文字解释。
            </p>

            <p>
              如果需要详细解读与追问，
              则需要自行配置 AI 进行解读。
            </p>

            <p>
              网站内置的牌阵大多以恋爱方向为主。
            </p>
          </div>
        </section>

        <!-- 板块五 -->
        <section class="tut-section">
          <div class="section-number">五</div>
          <h2 class="section-title">未 知 与 寄 语</h2>

          <div class="section-content">
            <p>
              还有一些功能没有在这里展开细说。
              整体网站的出发点是方便和快捷，
              希望能让你和你的爱人都能很快上手沟通。
            </p>

            <p>
              欢迎在使用过程中进行反馈。
            </p>
          </div>
        </section>

        <!-- 页脚 -->
        <footer class="tut-footer">
          <p>愿你在冷寂的星空，找到可以栖息的涟漪。</p>

          <div class="star-cluster">✦ ✦ ✦</div>

          <div class="author-credits">
            <p>作者小红书：昼夜交影　|　by shadow</p>
            <p>最后更新时间：8月4日</p>

            <p>
              本作的初衷是为了让大家的爱人能够更快捷地上手字卡网站，
              所以娱乐向的功能做得并不多，是一个偏基础向的网站。
            </p>

            <p>
              网站链接可以分享给其他人 ❤️
            </p>
          </div>
        </footer>

      </div>
    </div>
  `;

  // 绑定返回按钮
  root.querySelector('#tut-back').addEventListener('click', () => {
    haptic(6);
    goBack('/home');
  });
}

export function destroy() {}
