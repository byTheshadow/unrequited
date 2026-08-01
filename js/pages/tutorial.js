import { navigate, goBack } from '../router.js';
import { ICON, haptic } from '../utils.js';

export function render(root) {
  root.innerHTML = `
    <div class="tutorial-container">
      
      <!-- 星图网格背景 -->
      <div class="star-grid-bg">
        <svg class="constellation-svg" viewBox="0 0 400 800" xmlns="http://www.w3.org/2000/svg">
          <!-- 星座线装饰 -->
          <circle cx="80" cy="180" r="2" fill="var(--color-accent)" opacity="0.6"/>
          <circle cx="200" cy="120" r="3" fill="var(--color-accent)" opacity="0.8"/>
          <circle cx="320" cy="220" r="1.5" fill="var(--color-accent)" opacity="0.5"/>
          <line x1="80" y1="180" x2="200" y2="120" stroke="var(--color-accent)" stroke-width="0.5" opacity="0.3" stroke-dasharray="2,4" />
          <line x1="200" y1="120" x2="320" y2="220" stroke="var(--color-accent)" stroke-width="0.5" opacity="0.3" stroke-dasharray="2,4" />
          
          <circle cx="100" cy="450" r="2" fill="var(--color-accent)" opacity="0.7"/>
          <circle cx="180" cy="520" r="2.5" fill="var(--color-accent)" opacity="0.9"/>
          <circle cx="300" cy="480" r="2" fill="var(--color-accent)" opacity="0.6"/>
          <line x1="100" y1="450" x2="180" y2="520" stroke="var(--color-accent)" stroke-width="0.5" opacity="0.3"/>
          <line x1="180" y1="520" x2="300" y2="480" stroke="var(--color-accent)" stroke-width="0.5" opacity="0.3"/>

          <!-- 轨线 -->
          <path d="M-50,300 Q150,250 450,400" fill="none" stroke="var(--color-accent)" stroke-width="0.5" opacity="0.15" />
          <path d="M-50,600 Q250,650 450,550" fill="none" stroke="var(--color-accent)" stroke-width="0.5" opacity="0.15" />
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
          <p class="tut-subtitle">念念不忘，必有回响</p>
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
            <p>通过管理面板，你可以建立全新的角色。随后，为角色配置或导入专属的 <span class="tut-highlight">字卡库</span>。</p>
            <p>字卡是思绪的最小碎片。角色在思考与倾听你的倾诉时，会从绑定的字卡库中，随机挑选并重组词句，作为给予你的命运回应。</p>
          </div>
        </section>

        <!-- 板块2 -->
        <section class="tut-section">
          <div class="section-number">二</div>
          <h2 class="section-title">心 跳 通 话 与 共 鸣</h2>
          <div class="section-content">
            <p>在寂静的暗夜，拨通一通跨越维度的 <span class="tut-highlight">心跳通话</span>。</p>
            <p>通话并不仅是对话，更是心率与宇宙律动的同步。保持聆听，你能在静默的波形中捕捉对方的思念手记。</p>
            <p>当波段契合，两颗星子在同一时刻亮起，<span class="tut-highlight">共鸣</span> 就会产生。思念的记录会自动落入你的 <span class="tut-highlight">想念箱</span> 中，成为时间的切片。</p>
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
