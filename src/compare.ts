import './compare.css'

const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-scene]')]
const before = document.querySelector<HTMLIFrameElement>('#before')!
const after = document.querySelector<HTMLIFrameElement>('#after')!

function select(scene: string): void {
  const selected = buttons.find(button => button.dataset.scene === scene) ?? buttons[0]
  scene = selected.dataset.scene!
  for (const button of buttons) button.setAttribute('aria-pressed', String(button === selected))
  before.src = `./?look=original&sample=${scene}&embed=1`
  after.src = `./?sample=${scene}&embed=1`
  before.title = `Original Tank City — ${selected.textContent?.trim()}`
  after.title = `Cartoon Tank City — ${selected.textContent?.trim()}`
  history.replaceState(null, '', `#${scene}`)
}

for (const button of buttons) button.addEventListener('click', () => select(button.dataset.scene!))
if (location.hash) select(location.hash.slice(1))
window.addEventListener('hashchange', () => select(location.hash.slice(1)))
