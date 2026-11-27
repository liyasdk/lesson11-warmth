(() => {
    const get = id => document.getElementById(id);
    const client = window.lessonClient;
    const login = get('login');
    const status = get('status');
    const dashboard = get('dashboard');
    const timestamp = value => value ? new Date(value).toLocaleString('zh-TW') : '—';
    const categories = { body: '身體感受', action: '關愛行動', participate: '一起參與', heart: '心裡感受', distractor: '其他句子' };
    let activeSeat = null;
    let detailOffset = 0;
    let detailRequest = 0;
    let authorized = false;
    let refreshing = false;

    if (!client) {
        status.textContent = '教師後台尚未設定 Supabase。';
        login.querySelector('button').disabled = true;
        return;
    }

    function append(parent, tag, value) {
        const el = document.createElement(tag);
        el.textContent = value;
        parent.append(el);
        return el;
    }

    let reviewTemplate;
    function loadReviewTemplate() {
        if (!reviewTemplate) {
            reviewTemplate = fetch('./index.html').then(response => {
                if (!response.ok) throw new Error('Unable to load lesson');
                return response.text();
            }).then(html => {
                const lesson = new DOMParser().parseFromString(html, 'text/html');
                lesson.querySelectorAll('script[src]').forEach(script => {
                    const src = script.getAttribute('src');
                    if (/student[.]js|config[.]js|@supabase/.test(src)) script.remove();
                });
                const guard = lesson.createElement('script');
                guard.textContent = 'window.recordAnswer = () => {};';
                lesson.head.append(guard);
                return '<!doctype html>' + lesson.documentElement.outerHTML;
            }).catch(error => { reviewTemplate = null; throw error; });
        }
        return reviewTemplate;
    }

    function originalAnswer(frame, row) {
        const win = frame.contentWindow;
        const doc = frame.contentDocument;
        const find = id => doc.getElementById(id);
        const p = row.payload;
        let panel;
        if (row.kind === 'choice') {
            const task = Number(row.task);
            const question = Number(row.item);
            const limit = task === 3 ? 5 : 4;
            if (!Number.isInteger(question) || question < 1 || question > limit) return null;
            const dual = task === 3;
            if (dual) win.restartDualQuiz();
            else win.startTaskCompQuiz(task);
            for (let index = 1; index < question; index++) {
                if (dual) win.nextDualQuestion();
                else win.nextTaskCompQ(task);
            }
            const options = find(dual ? 'optionsContainer' : 'g' + task + '-compOptions');
            const title = find(dual ? 'questionTitle' : 'g' + task + '-compQTitle');
            if (title.textContent.trim() !== String(p.question).trim()) return null;
            const buttons = [...options.querySelectorAll('button')];
            const chosen = buttons.find(button => button.textContent.trim().replace(/^[A-D][.] */,'') === p.answer);
            if (!chosen) return null;
            chosen.click();
            chosen.style.outline = '3px solid ' + (p.correct ? '#15803d' : '#b45309');
            chosen.textContent += p.correct ? '　✓ 學生作答' : '　✗ 學生作答';
            panel = find(dual ? 'quizCardContainer' : 'g' + task + '-compQuiz').cloneNode(true);
            panel.querySelectorAll('[id]').forEach(node => {
                if (/compNextBtn|nextStageBtn/.test(node.id)) node.remove();
            });
        } else if (row.kind === 'classification' && [1, 2].includes(row.task)) {
            win.resetSingleGame(row.task);
            const root = find('g' + row.task + '-main');
            const cards = [...root.querySelectorAll('.clue-card')];
            const boxes = [...root.querySelectorAll('.cat-box')];
            for (const item of p.placements || []) {
                const card = cards.find(node => node.textContent.trim() === item?.text);
                const box = boxes.find(node => node.dataset.category === item?.category);
                if (!card || !box) continue;
                box.querySelector('.target-slot').append(card);
                const correct = item.category === item.expected;
                card.style.backgroundColor = correct ? '#3e735c' : '#a03535';
                card.textContent = (correct ? '✓ ' : '✗ ') + card.textContent;
            }
            find('g' + row.task + '-score').textContent = p.correct + ' / 10';
            find('g' + row.task + '-feedback').textContent = '第 ' + p.attempt + ' 次驗證｜本次放錯 ' + p.incorrect + ' 張';
            panel = root.cloneNode(true);
            panel.querySelectorAll('button').forEach(button => button.remove());
        } else if (row.kind === 'reflection') {
            panel = find('reflectionInput').closest('.rounded-2xl.border-2').cloneNode(true);
            panel.querySelectorAll('input, button, label + span, #savedReflectionCoinTag + span').forEach(node => node.remove());
            panel.querySelector('#savedReflectionDisplay').classList.remove('hidden');
            panel.querySelector('#savedReflectionQuote').textContent = String(p.answer ?? '');
            panel.querySelector('#savedReflectionCoinTag').textContent = '三關累計總金幣：' + p.coins + ' 枚';
        }
        if (!panel) return null;
        panel.classList.remove('hidden');
        panel.classList.add('flex', 'flex-col');
        for (const node of [panel, ...panel.querySelectorAll('*')]) {
            node.removeAttribute('id');
            for (const attribute of [...node.attributes]) {
                if (attribute.name.startsWith('on')) node.removeAttribute(attribute.name);
            }
            if (node.tagName === 'BUTTON') {
                node.disabled = true;
                node.classList.remove('opacity-60');
            }
        }
        return panel;
    }

    async function showOriginalAnswers(list, entries, request) {
        const frame = document.createElement('iframe');
        frame.title = '學生原版作答畫面';
        frame.hidden = true;
        frame.style.cssText = 'width:100%;height:360px;border:1px solid #dfd1bc;border-radius:1rem';
        const shell = document.createElement('li');
        shell.style.cssText = 'list-style:none;white-space:normal';
        const loading = append(shell, 'p', '正在載入學生原版作答畫面…');
        list.prepend(shell);
        try {
            const template = await loadReviewTemplate();
            if (!authorized || request !== detailRequest || !shell.isConnected) return;
            frame.addEventListener('load', () => {
                if (!authorized || request !== detailRequest || !shell.isConnected) return;
                try {
                    const doc = frame.contentDocument;
                    const source = [...doc.body.children];
                    const sheet = doc.createElement('main');
                    sheet.className = 'w-full max-w-6xl flex flex-col gap-4';
                    const recent = new Set();
                    for (const row of entries) {
                        const cardKey = [row.task, row.kind, row.item].join(':');
                        let panel;
                        try { panel = originalAnswer(frame, row); }
                        catch { panel = null; }
                        if (!panel) continue;
                        const article = doc.createElement(recent.has(cardKey) ? 'details' : 'article');
                        const label = doc.createElement(recent.has(cardKey) ? 'summary' : 'h2');
                        label.className = 'text-sm font-bold mb-2';
                        label.textContent = '任務 ' + row.task + '｜' + timestamp(row.received_at)
                            + (recent.has(cardKey) ? '｜較早作答' : '');
                        article.append(label, panel);
                        sheet.append(article);
                        recent.add(cardKey);
                    }
                    if (!sheet.children.length) throw new Error('No matching lesson panels');
                    source.forEach(node => { node.style.display = 'none'; });
                    doc.body.append(sheet);
                    frame.hidden = false;
                    loading.remove();
                    const resize = () => { frame.style.height = sheet.scrollHeight + 48 + 'px'; };
                    new ResizeObserver(resize).observe(sheet);
                    resize();
                    const history = document.createElement('details');
                    append(history, 'summary', '查看文字作答紀錄');
                    const records = document.createElement('ol');
                    [...list.children].filter(node => node !== shell).forEach(node => records.append(node));
                    history.append(records);
                    shell.append(history);
                } catch {
                    shell.remove();
                }
            }, { once: true });
            frame.srcdoc = template;
            shell.append(frame);
        } catch {
            shell.remove();
        }
    }

    const draw = document.createElement('button');
    draw.type = 'button';
    draw.textContent = '抽籤';
    get('refresh').before(draw);
    const drawResult = document.createElement('p');
    drawResult.setAttribute('role', 'status');
    get('summary').after(drawResult);
    draw.addEventListener('click', () => {
        const choices = [...get('rows').querySelectorAll('th button')];
        if (!choices.length) {
            drawResult.textContent = '名單載入後即可抽籤。';
            return;
        }
        const selected = choices[Math.floor(Math.random() * choices.length)];
        drawResult.textContent = '抽中 ' + selected.textContent + ' 號';
    });

    let answerEntries = [];
    async function details(seat, more = false) {
        activeSeat = seat;
        const request = ++detailRequest;
        const offset = more ? detailOffset : 0;
        const { data, error } = await client.from('lesson11_events').select('*')
            .eq('seat', seat).order('received_at', { ascending: false })
            .order('id', { ascending: false }).range(offset, offset + 39);
        if (!authorized || request !== detailRequest) return;
        if (error) { status.textContent = '明細讀取失敗，請再試一次。'; return; }
        get('detail-title').textContent = `座號 ${seat} 的作答明細`;
        const list = get('details');
        list.replaceChildren();
        answerEntries = more ? [...answerEntries, ...data] : data;
        if (!data.length && !more) append(list, 'li', '尚無作答');
        for (const row of answerEntries) {
            const p = row.payload;
            const prefix = `${timestamp(row.received_at)}｜任務 ${row.task}`;
            let answer = '';
            if (row.kind === 'choice') {
                answer = `第 ${row.item} 題｜${p.correct ? '答對' : '答錯'}\n${p.question}\n作答：${p.answer}`;
            } else if (row.kind === 'classification') {
                const placements = Array.isArray(p.placements) ? p.placements : [];
                const lines = placements.filter(card => card && typeof card === 'object').map(card =>
                    `${card.text} → ${categories[card.category] || card.category}${card.category === card.expected ? ' ✓' : ' ✗'}`);
                answer = [`分類第 ${p.attempt} 次｜已答對 ${p.correct}/10 張｜本次錯 ${p.incorrect} 張`, ...lines].join('\n');
            } else {
                answer = `心得｜${p.answer}\n金幣：${p.coins} 枚`;
            }
            append(list, 'li', `${prefix}｜${answer}`);
        }
        if (answerEntries.length) void showOriginalAnswers(list, answerEntries, request);
        detailOffset = offset + data.length;
        get('more').hidden = data.length < 40;
    }

    async function refresh() {
        if (!authorized || refreshing) return;
        refreshing = true;
        try {
            const { data, error } = await client.rpc('lesson11_overview');
            if (!authorized) return;
            if (error) throw error;
            const rows = get('rows');
            rows.replaceChildren();
            for (const student of data) {
                const tr = document.createElement('tr');
                const seat = append(append(tr, 'th', ''), 'button', student.seat);
                seat.type = 'button';
                seat.addEventListener('click', async () => {
                    await details(student.seat);
                    if (activeSeat === student.seat) get('detail-title').scrollIntoView({ block: 'start' });
                });
                for (const task of [1, 2, 3]) {
                    const progress = student.tasks[String(task)];
                    let label = '未作答';
                    if (progress) {
                        const sections = [];
                        if (progress.total) sections.push(`選擇 ${progress.answered}/${progress.total}（對 ${progress.correct}）`);
                        if (progress.classified !== null) sections.push(`分類 ${progress.classified}/10`);
                        if (progress.reflection) sections.push('已寫心得');
                        label = sections.join(' · ');
                    }
                    append(tr, 'td', label);
                }
                append(tr, 'td', timestamp(student.last_answer));
                rows.append(tr);
            }
            const started = data.filter(row => row.last_answer).length;
            get('summary').textContent = `${started} / ${data.length} 人已作答`;
            status.textContent = `最後更新 ${timestamp(new Date())}（每 5 秒自動更新全班進度）`;
        } catch {
            status.textContent = '全班進度更新失敗，請檢查連線。';
        } finally {
            refreshing = false;
        }
    }

    async function authorize(user) {
        const { data, error } = await client.from('lesson11_teachers')
            .select('user_id').eq('user_id', user.id).maybeSingle();
        if (error) { status.textContent = '無法驗證教師權限，請確認後端設定。'; return; }
        if (!data) {
            await client.auth.signOut();
            status.textContent = '這個帳號沒有教師權限。';
            return;
        }
        authorized = true;
        get('login-panel').hidden = true;
        dashboard.hidden = false;
        await refresh();
    }

    login.addEventListener('submit', async event => {
        event.preventDefault();
        const submit = login.querySelector('button');
        submit.disabled = true;
        try {
            const { data, error } = await client.auth.signInWithPassword({
                email: get('email').value.trim(), password: get('password').value
            });
            get('password').value = '';
            if (error) { status.textContent = '登入失敗，請確認帳號、密碼與網路連線。'; return; }
            await authorize(data.user);
        } finally { submit.disabled = false; }
    });
    get('logout').addEventListener('click', async () => {
        authorized = false;
        activeSeat = null;
        drawResult.textContent = '';
        answerEntries = [];
        get('rows').replaceChildren();
        get('details').replaceChildren();
        get('detail-title').textContent = '作答明細';
        get('more').hidden = true;
        dashboard.hidden = true;
        get('login-panel').hidden = false;
        const { error } = await client.auth.signOut();
        status.textContent = error ? '登出失敗，請重新登入後再試。' : '已登出';
    });
    get('refresh').addEventListener('click', () => {
        void refresh();
        if (activeSeat !== null) void details(activeSeat);
    });
    get('more').addEventListener('click', () => void details(activeSeat, true));
    setInterval(refresh, 5000);
    client.auth.getSession().then(({ data }) => {
        if (data.session) void authorize(data.session.user);
    });
})();
