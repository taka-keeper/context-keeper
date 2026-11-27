/**
 * ChatGPT / Claude / Gemini などの入力欄へ確実にテキストを注入し、
 * フレームワーク（React / ProseMirror / Quill）側のステートを更新する
 */
function insertPromptToInput(promptText) {
  // 1. サイトごとの代表的な入力欄セレクタを優先順で探索
  const selectors = [
    'div.ProseMirror[contenteditable="true"]', // Claude / ChatGPT(新UI)
    'div[contenteditable="true"][role="textbox"]', // Gemini / 汎用リッチエディタ
    'textarea#prompt-textarea', // ChatGPT(旧UI/フォールバック)
    'div[contenteditable="true"]', // その他contenteditable
    'textarea' // 汎用textarea
  ];

  let target = null;
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    // 非表示要素（offsetParent === null）を除外して可視要素を取得
    if (el && el.offsetParent !== null) {
      target = el;
      break;
    }
  }

  if (!target) {
    console.warn('[Context Keeper] 入力欄が見つかりませんでした。');
    return false;
  }

  target.focus();

  // パターンA: 標準の textarea の場合（Reactのvalueトラッカー回避）
  if (target.tagName === 'TEXTAREA') {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value'
    )?.set;

    if (nativeSetter) {
      nativeSetter.call(target, promptText);
    } else {
      target.value = promptText;
    }
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  // パターンB: contenteditable（Gemini / Claude / 新ChatGPT）の場合
  if (target.isContentEditable) {
    // 既存の入力内容を全選択して置き換える準備
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(target);
    selection.removeAllRanges();
    selection.addRange(range);

    // 方法1: execCommand('insertText') を試行
    // 非推奨APIだが、ProseMirrorやQuillのbeforeinput/inputパイプラインを最も自然に発火させる
    const inserted = document.execCommand('insertText', false, promptText);

    // 方法2: execCommandがブロックされた、または中身が空のままの場合のフォールバック（擬似ペースト）
    if (!inserted || target.textContent.trim() === '') {
      const dataTransfer = new DataTransfer();
      dataTransfer.setData('text/plain', promptText);

      const pasteEvent = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: dataTransfer
      });

      target.dispatchEvent(pasteEvent);

      // それでも入らない場合の最終手段（直接DOM書き換え＋InputEvent）
      if (target.textContent.trim() === '') {
        target.textContent = promptText;
        target.dispatchEvent(
          new InputEvent('input', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertText',
            data: promptText
          })
        );
      }
    }
    return true;
  }

  return false;
}
