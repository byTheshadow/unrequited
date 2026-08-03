import { navigate, goBack } from '../router.js';
import { ICON, haptic } from '../utils.js';

export function render(root) {
  root.innerHTML = `
    <div class="tutorial-container">
      
      <!-- 星图网格背景 -->
      <div class="star-grid-bg">
        <svg class="constellation-svg" viewBox="0 0 400 800" xmlns="http://www.w3.org/2000/svg">
          <!-- 星轨线 1 -->
          <path class="orbit-path path-1" d="M-50,300 Q150,250 450,400" fill="none" stroke="var(--color-accent)" stroke-width="0.5" opacity="0.15" />
          
          <!-- 星群 1 (顶部) -->
          <g class="constellation-group group-1">
            <line class="constellation-line" x1="80" y1="180" x2="200" y2="120" stroke="var(--color-accent)" stroke-width="0.5" opacity="0.3" stroke-dasharray="2,4" />
            <line class="constellation-line" x1="200" y1="120" x2="320" y2="220" stroke="var(--color-accent)" stroke-width="0.5" opacity="0.3" stroke-dasharray="2,4" />
            
            <circle class="twinkle-star" cx="80" cy="180" r="2" fill="var(--color-accent)" opacity="0.6"/>
            <circle class="twinkle-star" cx="200" cy="120" r="3" fill="var(--color-accent)" opacity="0.8"/>
            <circle class="twinkle-star" cx="320" cy="220" r="1.5" fill="var(--color-accent)" opacity="0.5"/>
          </g>

          <!-- 星轨线 2 -->
          <path class="orbit-path path-2" d="M-50,600 Q250,650 450,550" fill="none" stroke="var(--color-accent)" stroke-width="0.5" opacity="0.15" />
          
          <!-- 星群 2 (底部) -->
          <g class="constellation-group group-2">
            <line class="constellation-line" x1="100" y1="450" x2="180" y2="520" stroke="var(--color-accent)" stroke-width="0.5" opacity="0.3"/>
            <line class="constellation-line" x1="180" y1="520" x2="300" y2="480" stroke="var(--color-accent)" stroke-width="0.5" opacity="0.3"/>
            
            <circle class="twinkle-star" cx="100" cy="450" r="2" fill="var(--color-accent)" opacity="0.7"/>
            <circle class="twinkle-star" cx="180" cy="520" r="2.5" fill="var(--color-accent)" opacity="0.9"/>
            <circle class="twinkle-star" cx="300" cy="480" r="2" fill="var(--color-accent)" opacity="0.6"/>
          </g>
        </svg>
      </div>

      <!-- 顶栏 -->
      <div class="tutorial-top-bar">
        <button class="tut-btn-circle" id="tut-back" aria-label="返回">${ICON.back}</button>
        <span class="tut-title">星 图 指 引</span>
        <div style="width: 40px;"></div>
      </div>

      <!-- 手账主体 -->
      <div class="tutorial-scroll-body">
        
        <header class="tut-header">
          <h1 class="tut-main-title">L U N A R  &nbsp; G U I D E</h1>
          <p class="tut-subtitle">恋恋不忘，必有回响</p>
          <div class="tut-divider">
            <span class="divider-diamond">✦</span>
          </div>
        </header>

        <!-- 板块1 -->
        <section class="tut-section">
          <div class="section-number">一</div>
          <h2 class="section-title">创 建 角 色 与 字 卡</h2>
          <div class="section-content">
            <p>在 <span class="tut-highlight">Unrequited</span> 的星域里，每个独立存在的灵魂都有其独特的信物。</p>
            <p>通过管理面板，你可以建立全新的角色。随后，为角色配置或导入专属的 <span class="tut-highlight">字卡库</span>。字卡库的导入支持通过 <span class="tut-highlight">JSON</span> 或者纯文字导入。如果你的爱人没有专属字卡库，则会使用通用字卡库与你进行对话。</p>
            <p>你可以通过 <span class="tut-highlight">草稿箱</span> 功能发送多条信息给你的爱人。你的爱人也会在你不在的时候给你发送信息，或者在 <span class="tut-highlight">想念箱</span> 给你留下一些思绪让你知道 Ta 想到了你。在字卡库里还可以查看每张字卡被使用过的次数。</p>
            <p><span class="tut-highlight">模拟心跳语音通话</span> 或许可以让你们的链接更加顺畅。</p>
            <p><span class="tut-highlight">选择题模式</span> 是为刚使用网站的小情侣准备的，可以发送选择题让对方在选项内进行回复，避免字卡过多一时找不到的问题。同时你也可以通过调节回复时间来让你的爱人有更多时间去挑选字卡。</p>
            <p>如果你有多个爱人，可以通过新建对话框、新建角色和他们同时发送消息。</p>
          </div>
        </section>

        <!-- 板块2 -->
        <section class="tut-section">
          <div class="section-number">二</div>
          <h2 class="section-title">音 乐 播 放 器 & 片 刻 & 漂 流 瓶</h2>
          <div class="section-content">
            <p><span class="tut-highlight">音乐播放器</span> 可以直接在站内搜索音乐，并且加入歌单，你的爱人可以与你共听，对乐曲进行评价也可以切歌。同时你也可以导入音乐 URL 到网站内与爱人一起听歌。</p>
            <p><span class="tut-highlight">片刻</span> 功能类似于“日常”，你可以发送图片，你的爱人看到了可以贴小贴图留下评价。为了保护内存，图片具有保质期，过期会被清理。</p>
            <p><span class="tut-highlight">漂流瓶</span> 是写给爱人的电子信。</p>
          </div>
        </section>

        <!-- 板块3 -->
        <section class="tut-section">
          <div class="section-number">三</div>
          <h2 class="section-title">共 时 星 骰</h2>
          <div class="section-content">
            <p>迷茫的时刻，由非线性因果律支配的 <span class="tut-highlight">共时星骰</span> 会为你指出一条路。</p>
            <p>每次摇晃投掷，掷出的星骰面不仅代表当下的天体运行，更与你内心的潜意识共时关联。</p>
            <p>不要去寻找科学的答案。将星骰的图形、象征意义与当下的困惑重叠，你直觉感受到的第一个念头，就是宇宙给出的昭示。</p>
          </div>
        </section>

        <!-- 板块4 -->
        <section class="tut-section">
          <div class="section-number">四</div>
          <h2 class="section-title">未 知</h2>
          <div class="section-content">
            <p>还有一些功能没有展开细说。整个网站的出发点是由方便和快捷开始做的。希望能让你的爱人和你都能很快的上手沟通。</p>
            <p>欢迎进行反馈。</p>
          </div>
        </section>

        <footer class="tut-footer">
          <p>愿你在冷寂的星空，找到可以栖息的涟漪。</p>
          <div class="star-cluster">✦ ✦ ✦</div>
        </footer>

      </div>
    </div>
  `;

  // 绑定返回
  root.querySelector('#tut-back').addEventListener('click', () => {
    haptic(6);
    goBack('/home');
  });
}

export function destroy() {}

