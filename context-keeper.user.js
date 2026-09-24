// ==UserScript==
// @name         コンテキスト・キーパー（仮）プロトタイプ
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  AIの文脈忘れを防ぐためのメーターとセーブボタン
// @author       AI Developer
// @match        https://gemini.google.com/*
// @match        https://chatgpt.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // === 設定（プロデューサー側で変更可能） ===
    // ※テストですぐにゲージが上がるよう、一旦「1万文字」を限界値にしています。
    const LIMIT_CHARS = 10000;
    const WARNING_THRESHOLD = 0.8; // 80% (8,000文字) で警告開始
    const SAVE_PROMPT = "ここまでの決定事項を要約して出力せよ。次回に引き継ぐための設定ファイルとして箇条書きでまとめること。";

    // === UI生成 ===
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.top = '20px';
    container.style.right = '20px';
    container.style.padding = '15px';
    container.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
    container.style.border = '2px solid #ccc';
    container.style.borderRadius = '8px';
    container.style.zIndex = '999999';
    container.style.boxShadow = '0 4px 10px rgba(0,0,0,0.2)';
    container.style.fontFamily = 'sans-serif';
    container.style.minWidth = '220px';
    container.style.pointerEvents = 'auto';

    const title = document.createElement('div');
    title.innerText = '🧠 コンテキスト・キーパー';
    title.style.fontWeight = 'bold';
    title.style.marginBottom = '10px';
    title.style.fontSize = '14px';
    title.style.color = '#333';
    container.appendChild(title);

    const meterInfo = document.createElement('div');
    meterInfo.style.fontSize = '12px';
    meterInfo.style.marginBottom = '5px';
    meterInfo.style.color = '#666';
    container.appendChild(meterInfo);

    const meterBarContainer = document.createElement('div');
    meterBarContainer.style.width = '100%';
    meterBarContainer.style.height = '12px';
    meterBarContainer.style.backgroundColor = '#e0e0e0';
    meterBarContainer.style.borderRadius = '6px';
    meterBarContainer.style.overflow = 'hidden';
    container.appendChild(meterBarContainer);

    const meterBar = document.createElement('div');
    meterBar.style.width = '0%';
    meterBar.style.height = '100%';
    meterBar.style.backgroundColor = '#4CAF50'; // 初期は安全（緑）
    meterBar.style.transition = 'width 0.5s ease-in-out, background-color 0.5s ease';
    meterBarContainer.appendChild(meterBar);

    const alertMsg = document.createElement('div');
    alertMsg.style.fontSize = '12px';
    alertMsg.style.color = '#d32f2f';
    alertMsg.style.fontWeight = 'bold';
    alertMsg.style.marginTop = '10px';
    alertMsg.style.display = 'none';
    alertMsg.innerText = '⚠️ AIの記憶忘却が近づいています。設定を保存してください。';
    container.appendChild(alertMsg);

    const saveBtn = document.createElement('button');
    saveBtn.innerText = '💾 ワンタッチ・セーブ';
    saveBtn.style.marginTop = '10px';
    saveBtn.style.padding = '8px 12px';
    saveBtn.style.width = '100%';
    saveBtn.style.cursor = 'pointer';
    saveBtn.style.backgroundColor = '#1976d2';
    saveBtn.style.color = 'white';
    saveBtn.style.border = 'none';
    saveBtn.style.borderRadius = '4px';
    saveBtn.style.fontWeight = 'bold';
    saveBtn.style.display = 'none'; // 警告時のみ表示
    container.appendChild(saveBtn);

    document.body.appendChild(container);

    // === セーブボタンのイベント（クリップボードへのコピー） ===
    saveBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(SAVE_PROMPT).then(() => {
            alert(`【コンテキスト・キーパー】\n以下のプロンプトをクリップボードにコピーしました。\nチャット入力欄にペーストして送信してください。\n\n「${SAVE_PROMPT}」`);
        }).catch(err => {
            alert('コピーに失敗しました。手動で入力してください。');
        });
    });

    // === メーター更新ロジック ===
    function updateMeter() {
        // 対象のチャット領域をなるべく絞るが、無ければ全体から取得
        const mainContent = document.querySelector('main') || document.body;
        // 改行や空白を削除した純粋な文字数をカウント
        const textContent = mainContent.innerText.replace(/\s+/g, '');
        const currentChars = textContent.length;
        
        const ratio = Math.min(currentChars / LIMIT_CHARS, 1);
        const percent = Math.floor(ratio * 100);
        
        meterInfo.innerText = `推計文字数: ${currentChars.toLocaleString()} / ${LIMIT_CHARS.toLocaleString()}`;
        meterBar.style.width = `${percent}%`;

        // 色とアラートの制御
        if (ratio >= 1) {
            meterBar.style.backgroundColor = '#d32f2f'; // 危険（赤）
            container.style.borderColor = '#d32f2f';
            alertMsg.style.display = 'block';
            saveBtn.style.display = 'block';
        } else if (ratio >= WARNING_THRESHOLD) {
            meterBar.style.backgroundColor = '#fbc02d'; // 注意（黄）
            container.style.borderColor = '#fbc02d';
            alertMsg.style.display = 'block';
            saveBtn.style.display = 'block';
        } else {
            meterBar.style.backgroundColor = '#4CAF50'; // 安全（緑）
            container.style.borderColor = '#ccc';
            alertMsg.style.display = 'none';
            saveBtn.style.display = 'none';
        }
    }

    // 2秒ごとに文字数をチェック
    setInterval(updateMeter, 2000);
    // 初回実行
    updateMeter();

})();
