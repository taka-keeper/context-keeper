// ==UserScript==
// @name         コンテキスト・キーパー（仮）プロトタイプ
// @namespace    http://tampermonkey.net/
// @version      0.31
// @description  AIの文脈忘れを防ぐためのトークン推計メーターと自動セーブ支援
// @author       taka-keeper
// @match        https://gemini.google.com/*
// @match        https://chatgpt.com/*
// @match        https://claude.ai/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // === 設定値（テスト用に低めの15,000トークンに設定中） ===
    const LIMIT_TOKENS = 15000;
    const WARNING_THRESHOLD = 0.75; // 75%で注意（黄）
    const DANGER_THRESHOLD = 0.90;  // 90%で危険（赤）
    const SAVE_PROMPT = "【引き継ぎ用セーブ】ここまでの議論・決定事項・現在のコードや設定の全体像を、次の新しいチャットにそのまま貼り付けて引き継げるよう、構造化された箇条書きで要約して出力してください。";

    // === UI生成（ダークテーマ＆最小化対応） ===
    const container = document.createElement('div');
    Object.assign(container.style, {
        position: 'fixed',
        top: '16px',
        right: '16px',
        padding: '12px 14px',
        backgroundColor: 'rgba(24, 24, 27, 0.92)',
        color: '#f4f4f5',
        border: '1px solid #3f3f46',
        borderRadius: '10px',
        zIndex: '2147483647',
        boxShadow: '0 8px 20px rgba(0,0,0,0.4)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        width: '240px',
        backdropFilter: 'blur(6px)',
        transition: 'border-color 0.3s ease'
    });

    // ヘッダー（タイトル＋最小化ボタン）
    const header = document.createElement('div');
    Object.assign(header.style, {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '8px'
    });

    const title = document.createElement('span');
    title.innerText = '🧠 Context-Keeper v0.31';
    Object.assign(title.style, {
        fontWeight: 'bold',
        fontSize: '13px',
        letterSpacing: '0.3px'
    });

    const toggleBtn = document.createElement('button');
    toggleBtn.innerText = '－';
    Object.assign(toggleBtn.style, {
        background: 'transparent',
        border: 'none',
        color: '#a1a1aa',
        cursor: 'pointer',
        fontSize: '14px',
        padding: '0 4px',
        lineHeight: '1'
    });

    header.appendChild(title);
    header.appendChild(toggleBtn);
    container.appendChild(header);

    // メインボディ（最小化時に隠す領域）
    const bodyArea = document.createElement('div');

    const meterInfo = document.createElement('div');
    Object.assign(meterInfo.style, {
        fontSize: '11px',
        marginBottom: '6px',
        color: '#d4d4d8',
        display: 'flex',
        justifyContent: 'space-between'
    });
    bodyArea.appendChild(meterInfo);

    const meterBarContainer = document.createElement('div');
    Object.assign(meterBarContainer.style, {
        width: '100%',
        height: '8px',
        backgroundColor: '#27272a',
        borderRadius: '4px',
        overflow: 'hidden'
    });

    const meterBar = document.createElement('div');
    Object.assign(meterBar.style, {
        width: '0%',
        height: '100%',
        backgroundColor: '#10b981',
        transition: 'width 0.4s ease, background-color 0.4s ease'
    });
    meterBarContainer.appendChild(meterBar);
    bodyArea.appendChild(meterBarContainer);

    const alertMsg = document.createElement('div');
    Object.assign(alertMsg.style, {
        fontSize: '11px',
        color: '#fca5a5',
        marginTop: '8px',
        lineHeight: '1.4',
        display: 'none'
    });
    alertMsg.innerText = '⚠️ 文脈忘却（トコロテン）の危険域です。要約の保存を推奨します。';
    bodyArea.appendChild(alertMsg);

    // セーブボタン（常時表示）
    const saveBtn = document.createElement('button');
    saveBtn.innerText = '💾 引き継ぎプロンプトを挿入';
    Object.assign(saveBtn.style, {
        marginTop: '10px',
        padding: '7px 10px',
        width: '100%',
        cursor: 'pointer',
        backgroundColor: '#2563eb',
        color: '#ffffff',
        border: 'none',
        borderRadius: '6px',
        fontWeight: 'bold',
        fontSize: '12px',
        display: 'block',
        transition: 'background-color 0.2s ease'
    });
    bodyArea.appendChild(saveBtn);

    container.appendChild(bodyArea);
    document.body.appendChild(container);

    // === 最小化トグル処理 ===
    let isMinimized = false;
    toggleBtn.addEventListener('click', () => {
        isMinimized = !isMinimized;
        bodyArea.style.display = isMinimized ? 'none' : 'block';
        header.style.marginBottom = isMinimized ? '0' : '8px';
        toggleBtn.innerText = isMinimized ? '＋' : '－';
    });

    // === 簡易トークン推計ロジック ===
    // 英数字・記号(ASCII)は約0.3トークン、日本語などのマルチバイト文字は約1.2トークンとして推計
    function estimateTokens(text) {
        if (!text) return 0;
        const cleanText = text.replace(/\s+/g, '');
        let asciiCount = 0;
        let nonAsciiCount = 0;

        for (let i = 0; i < cleanText.length; i++) {
            if (cleanText.charCodeAt(i) <= 127) {
                asciiCount++;
            } else {
                nonAsciiCount++;
            }
        }
        return Math.ceil((asciiCount * 0.3) + (nonAsciiCount * 1.2));
    }

    /**
     * ChatGPT / Claude / Gemini などの入力欄へ確実にテキストを注入し、
     * フレームワーク（React / ProseMirror / Quill）側のステートを更新する
     */
    function insertPromptToInput(promptText) {
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
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(target);
            selection.removeAllRanges();
            selection.addRange(range);

            const inserted = document.execCommand('insertText', false, promptText);

            if (!inserted || target.textContent.trim() === '') {
                const dataTransfer = new DataTransfer();
                dataTransfer.setData('text/plain', promptText);

                const pasteEvent = new ClipboardEvent('paste', {
                    bubbles: true,
                    cancelable: true,
                    clipboardData: dataTransfer
                });

                target.dispatchEvent(pasteEvent);

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

    // === チャット入力欄への自動流し込み＋クリップボード保存 ===
    saveBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(SAVE_PROMPT).catch(() => {});

        const success = insertPromptToInput(SAVE_PROMPT);
        if (success) {
            saveBtn.innerText = '✅ 入力欄にセット＆コピー完了！';
        } else {
            alert(`【Context-Keeper】\n入力欄が見つからなかったため、クリップボードにコピーしました。手動でペーストしてください。\n\n${SAVE_PROMPT}`);
        }

        setTimeout(() => {
            saveBtn.innerText = '💾 引き継ぎプロンプトを挿入';
        }, 3000);
    });

    // === メーター更新ロジック ===
    function updateMeter() {
        const mainContent = document.querySelector('main') || document.body;
        const rawText = mainContent.innerText || '';
        const estTokens = Math.max(0, estimateTokens(rawText) - 35);

        const ratio = Math.min(estTokens / LIMIT_TOKENS, 1);
        const percent = Math.floor(ratio * 100);

        meterInfo.innerHTML = `<span>推計: <b>${estTokens.toLocaleString()}</b> / ${LIMIT_TOKENS.toLocaleString()} tok</span><span>${percent}%</span>`;
        meterBar.style.width = `${percent}%`;

        if (ratio >= DANGER_THRESHOLD) {
            meterBar.style.backgroundColor = '#ef4444';
            container.style.borderColor = '#ef4444';
            alertMsg.style.display = 'block';
        } else if (ratio >= WARNING_THRESHOLD) {
            meterBar.style.backgroundColor = '#f59e0b';
            container.style.borderColor = '#f59e0b';
            alertMsg.style.display = 'block';
        } else {
            meterBar.style.backgroundColor = '#10b981';
            container.style.borderColor = '#3f3f46';
            alertMsg.style.display = 'none';
        }
    }

    // === MutationObserverによるスマートなDOM監視（デバウンス付き） ===
    let debounceTimer = null;
    const observer = new MutationObserver(() => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            updateMeter();
        }, 800);
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
    });

    // 初回実行
    setTimeout(updateMeter, 1000);

})();
