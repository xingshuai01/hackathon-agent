/**
 * hackathon-agent Web 前端 · 零框架零构建。
 *
 * 职责:订阅 /events(SSE)→ 渲染过程流;拉 /api/* → 渲染三面板。
 * **不含任何业务判断** —— 只把事件翻译成 DOM(薄壳,AC-F4.2~F4.5)。
 */
(() => {
  'use strict'

  // ─────────────────────────────────────────────
  // 1. 元素引用与状态
  // ─────────────────────────────────────────────

  const $ = (id) => document.getElementById(id)
  const statusDot = $('status-dot')
  const banner = $('reconnect-banner')
  const form = $('ask-form')
  const input = $('ask-input')
  const button = $('ask-button')
  const streamArea = $('stream-area')
  const emptyHint = $('empty-hint')
  const panelContent = $('panel-content')
  const panelTitle = $('panel-title')
  const artifactsBar = $('artifacts-bar')
  const counts = { knowledge: $('count-knowledge'), tools: $('count-tools'), skills: $('count-skills') }

  /** 当前活跃的运行块 */
  let currentRun = null
  /** 每个运行块里「未完成的工具行」,key = tool id */
  let openToolLines = new Map()
  /** 当前 agent 文本元素(流式追加目标) */
  let currentAgentEl = null
  /** 用户是否停留在底部(自动滚动只在此时跟随) */
  let autoScroll = true
  /** 面板缓存 */
  const panelCache = { knowledge: null, tools: null, skills: null }
  let activeTab = 'knowledge'

  // ─────────────────────────────────────────────
  // 2. 工具函数
  // ─────────────────────────────────────────────

  const el = (tag, className, text) => {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text !== undefined) node.textContent = text
    return node
  }

  const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

  function scrollIfPinned() {
    if (autoScroll) streamArea.scrollTop = streamArea.scrollHeight
  }

  streamArea.addEventListener('scroll', () => {
    const nearBottom = streamArea.scrollHeight - streamArea.scrollTop - streamArea.clientHeight < 80
    autoScroll = nearBottom
  })

  /** 开始一个新的运行块(用户提交问题时调用) */
  function beginRun(question) {
    emptyHint.classList.add('hidden')
    openToolLines = new Map()
    currentAgentEl = null

    const block = el('div', 'run-block')
    block.appendChild(el('div', 'msg-user', question))

    const agentWrap = el('div', 'msg-agent')
    block.appendChild(agentWrap)
    currentAgentEl = agentWrap
    currentRun = block
    streamArea.appendChild(block)
    autoScroll = true
    scrollIfPinned()
  }

  function finishRun(footer) {
    if (!currentRun) return
    currentRun.appendChild(footer)
    currentRun = null
    openToolLines = new Map()
    currentAgentEl = null
    // run_end 后三面板必须自动刷新(AC-F2.5)
    refreshAllPanels()
    refreshArtifacts()
  }

  // ─────────────────────────────────────────────
  // 3. 事件 → DOM(9 种,对应 docs/web-design.md §4)
  // ─────────────────────────────────────────────

  const renderers = {
    text_delta(evt) {
      if (!currentRun) return
      const target = currentAgentEl ?? (() => {
        const wrap = el('div', 'msg-agent typing')
        currentRun.appendChild(wrap)
        currentAgentEl = wrap
        return wrap
      })()
      target.textContent += evt.text
      scrollIfPinned()
    },

    tool_start(evt) {
      if (!currentRun) return
      const line = el('div', 'tool-line')
      line.appendChild(el('span', 'spinner'))
      const name = el('span', 'tool-name', '⚙ ' + evt.name)
      const args = el('span', 'tool-args')
      try { args.textContent = ' ' + JSON.stringify(evt.input ?? {}) } catch { args.textContent = '' }
      const result = el('span', 'tool-result', '执行中…')
      line.append(name, args, result)
      currentRun.appendChild(line)
      openToolLines.set(evt.id, { line, result })
      scrollIfPinned()
    },

    tool_end(evt) {
      if (!currentRun) return
      const entry = openToolLines.get(evt.id)
      if (!entry) return
      entry.line.classList.add(evt.ok ? 'ok' : 'fail')
      entry.line.querySelector('.spinner')?.remove()
      const summary = evt.summary.length > 160 ? evt.summary.slice(0, 160) + '…' : evt.summary
      entry.result.textContent = (evt.ok ? '✓ ' : '✗ ') + evt.ms + 'ms · ' + summary
      openToolLines.delete(evt.id)
      scrollIfPinned()
    },

    skill_load(evt) {
      if (!currentRun) return
      const banner = el('div', 'banner')
      banner.appendChild(el('span', null, '📋 加载技能 ' + evt.name + ' '))
      banner.appendChild(el('span', 'reason', '(' + evt.reason + ')'))
      currentRun.appendChild(banner)
      scrollIfPinned()
    },

    knowledge_hit(evt) {
      if (!currentRun) return
      const chip = el('span', 'chip', '📚 ' + evt.paperId + ' p.' + evt.page + ' · ' + evt.description.slice(0, 60))
      chip.title = evt.noteId + '\n' + evt.description
      chip.addEventListener('click', () => highlightNote(evt.noteId))
      currentRun.appendChild(chip)
      scrollIfPinned()
    },

    tool_generated(evt) {
      if (currentRun) {
        const chip = el('span', 'chip', '🔧 生成工具 ' + evt.toolName + ' [' + evt.status + ']')
        currentRun.appendChild(chip)
      }
      panelCache.tools = null
    },

    progress(evt) {
      if (!currentRun) return
      let line = currentRun.querySelector('.progress-line.active')
      if (!line) {
        line = el('div', 'progress-line active')
        line.appendChild(el('span', 'pstep', evt.step))
        line.appendChild(el('span', 'bar'))
        currentRun.appendChild(line)
      }
      const ratio = evt.total > 0 ? evt.done / evt.total : 0
      line.querySelector('.pstep').textContent = `${evt.step} ${evt.done}/${evt.total}`
      line.querySelector('.bar').style.width = Math.min(100, Math.round(ratio * 100)) + '%'
      if (ratio >= 1) line.classList.remove('active')
      scrollIfPinned()
    },

    error(evt) {
      if (!currentRun) return
      currentRun.appendChild(el('div', 'err-line', '✗ [' + evt.stage + '] ' + evt.message))
      scrollIfPinned()
    },

    run_end(evt) {
      if (!currentRun) return
      const footer = el('div', 'run-footer')
      footer.classList.add(evt.reason === 'completed' ? 'completed' : 'failed')
      footer.textContent =
        '■ ' + evt.reason + ' · ' + (evt.ms / 1000).toFixed(1) + 's · tokens ' +
        evt.tokens.input + '/' + evt.tokens.output + ' · 工具 ' + evt.toolCalls + ' 次'
      finishRun(footer)
    },
  }

  // ─────────────────────────────────────────────
  // 4. SSE 连接状态机(设计 §5)
  // ─────────────────────────────────────────────

  let es = null
  let retryDelay = 3000
  let retryCount = 0
  let reconnectTimer = null

  function setStatus(state) {
    statusDot.className = 'dot ' + state
  }

  function connect() {
    if (es) { es.close(); es = null }
    setStatus('connecting')
    banner.classList.remove('hidden')
    es = new EventSource('/events')
    es.onopen = () => {
      setStatus('live')
      banner.classList.add('hidden')
      retryDelay = 3000
      retryCount = 0
    }
    es.onmessage = (msg) => {
      let evt
      try { evt = JSON.parse(msg.data) } catch { return }
      if (evt && evt.type && renderers[evt.type]) {
        try { renderers[evt.type](evt) } catch (err) { console.error('渲染事件失败', evt.type, err) }
      }
    }
    es.onerror = () => {
      setStatus('connecting')
      banner.classList.remove('hidden')
      es.close()
      es = null
      retryCount += 1
      if (retryCount > 10) {
        setStatus('offline')
        banner.textContent = '已离线,点此重试'
        banner.style.cursor = 'pointer'
        return
      }
      banner.textContent = '连接中断,正在重连…'
      clearTimeout(reconnectTimer)
      reconnectTimer = setTimeout(() => {
        retryDelay = Math.min(retryDelay * 1.5, 30000)
        connect()
      }, retryDelay)
    }
  }

  banner.addEventListener('click', () => {
    if (statusDot.classList.contains('offline')) {
      retryCount = 0
      retryDelay = 3000
      connect()
    }
  })

  // ─────────────────────────────────────────────
  // 5. 三面板(数据全部来自 /api/*)
  // ─────────────────────────────────────────────

  const PANEL_META = {
    knowledge: { title: '知识页', api: '/api/knowledge' },
    tools: { title: '工具', api: '/api/tools' },
    skills: { title: '技能', api: '/api/skills' },
  }

  async function fetchJson(url) {
    const res = await fetch(url, { cache: 'no-store' })
    return res.json()
  }

  async function refreshAllPanels() {
    try {
      const [k, t, s] = await Promise.all([
        fetchJson('/api/knowledge').catch(() => ({ items: [], error: '读取失败' })),
        fetchJson('/api/tools').catch(() => ({ items: [], error: '读取失败' })),
        fetchJson('/api/skills').catch(() => ({ items: [], error: '读取失败' })),
      ])
      panelCache.knowledge = k.items ?? []
      panelCache.tools = t.items ?? []
      panelCache.skills = s.items ?? []
      counts.knowledge.textContent = panelCache.knowledge.length
      counts.tools.textContent = panelCache.tools.length
      counts.skills.textContent = panelCache.skills.length
      renderActivePanel()
    } catch { /* 面板读取失败不崩页面 */ }
  }

  function renderActivePanel() {
    const items = panelCache[activeTab] ?? []
    panelTitle.textContent = PANEL_META[activeTab].title
    panelContent.textContent = ''
    if (items.length === 0) {
      panelContent.appendChild(el('div', 'panel-empty', '暂无数据。运行一次 ingest / ask 后这里会显示资产。'))
      return
    }
    for (const item of items) {
      panelContent.appendChild(renderCard(item))
    }
  }

  function renderCard(item) {
    const card = el('div', 'card')

    if (item.noteId) { // 知识页
      card.appendChild(el('span', 'badge kind-' + (item.kind || 'claim'), item.kind || 'claim'))
      card.appendChild(el('div', 'card-desc', item.description))
      card.appendChild(el('div', 'card-meta', item.noteId))
      const evidence = el('div', 'card-evidence', '▶ 证据(p.' + item.evidence.page + '):\n' + item.evidence.quote)
      card.appendChild(evidence)
    } else if (item.skillId) { // 技能
      card.appendChild(el('span', 'badge st-' + (item.status || 'draft'), item.status || 'draft'))
      card.appendChild(el('div', 'card-desc', item.name))
      card.appendChild(el('div', 'card-meta', item.skillId))
      card.appendChild(el('div', 'card-desc', item.whenToUse))
    } else { // 工具
      card.appendChild(el('span', 'badge st-' + (item.status || 'draft'), item.status || 'draft'))
      card.appendChild(el('div', 'card-desc', item.name))
      card.appendChild(el('div', 'card-meta', '来自 ' + item.sourcePaper))
      card.appendChild(el('div', 'card-desc', item.description.slice(0, 120)))
    }

    card.addEventListener('click', () => card.classList.toggle('open'))
    if (item.noteId) card.dataset.noteId = item.noteId
    return card
  }

  function highlightNote(noteId) {
    // 切到知识库 tab 并高亮对应卡片
    switchTab('knowledge')
    const target = panelContent.querySelector(`[data-note-id="${CSS.escape(noteId)}"]`)
    if (target) {
      target.classList.add('open')
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  function switchTab(tab) {
    activeTab = tab
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab))
    renderActivePanel()
  }

  document.querySelectorAll('.tab').forEach((b) => {
    b.addEventListener('click', () => switchTab(b.dataset.tab))
  })

  // ─────────────────────────────────────────────
  // 6. 提交任务与产物区
  // ─────────────────────────────────────────────

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const question = input.value.trim()
    if (question === '') return
    input.value = ''
    button.disabled = true

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })
      if (res.status === 409) {
        const body = await res.json().catch(() => ({ error: '提交失败' }))
        beginRun(question)
        currentRun.appendChild(el('div', 'err-line', '✗ ' + (body.error || '提交失败')))
        const footer = el('div', 'run-footer failed', '■ 未执行')
        finishRun(footer)
      } else if (res.ok) {
        beginRun(question)
      } else {
        beginRun(question)
        currentRun.appendChild(el('div', 'err-line', '✗ 提交失败:HTTP ' + res.status))
        finishRun(el('div', 'run-footer failed', '■ 未执行'))
      }
    } catch (err) {
      beginRun(question)
      currentRun.appendChild(el('div', 'err-line', '✗ 无法连接服务器:' + err.message))
      finishRun(el('div', 'run-footer failed', '■ 未执行'))
    }
    button.disabled = false
  })

  async function refreshArtifacts() {
    try {
      const body = await fetchJson('/api/artifacts')
      const files = body.items ?? []
      artifactsBar.textContent = ''
      if (files.length === 0) { artifactsBar.classList.add('hidden'); return }
      artifactsBar.classList.remove('hidden')
      artifactsBar.appendChild(el('span', 'label', '产物:'))
      for (const file of files.slice(0, 10)) {
        artifactsBar.appendChild(el('a', null, file.name))
      }
    } catch { /* 忽略 */ }
  }

  $('refresh-panels').addEventListener('click', refreshAllPanels)

  // ─────────────────────────────────────────────
  // 7. 启动
  // ─────────────────────────────────────────────

  connect()
  refreshAllPanels()
})()
