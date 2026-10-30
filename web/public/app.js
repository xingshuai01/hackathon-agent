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

  // 解析流水线元素
  const dropzone = $('dropzone')
  const pdfFile = $('pdf-file')
  const pickPdf = $('pick-pdf')
  const dzText = dropzone.querySelector('.dz-text')
  const dzFile = $('dz-file')
  const dzFilename = $('dz-filename')
  const dzClear = $('dz-clear')
  const dzLoading = $('dz-loading')
  const parseButton = $('parse-button')
  const wfParse = document.querySelector('.wf-parse')
  const wfCounts = { knowledge: $('wf-count-knowledge'), tools: $('wf-count-tools'), skills: $('wf-count-skills') }
  const modalBackdrop = $('modal-backdrop')
  const modalTitle = $('modal-title')
  const modalBody = $('modal-body')
  const modalClose = $('modal-close')

  /** 已选中的待解析 PDF */
  let pendingPdf = null

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
      wfCounts.knowledge.textContent = panelCache.knowledge.length
      wfCounts.tools.textContent = panelCache.tools.length
      wfCounts.skills.textContent = panelCache.skills.length
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

  /** 给卡片加「删除」按钮。工具是提交的生成代码,运行时不可删,只给知识页与技能加。 */
  function addDeleteButton(card, item) {
    if (!item.noteId && !item.skillId) return
    const kind = item.noteId ? 'knowledge' : 'skill'
    const label =
      kind === 'knowledge'
        ? '论文 ' + item.paperId + ' 的全部知识页'
        : (item.status === 'draft' ? '技能草案 ' : '技能 ') + item.skillId

    const btn = el('button', 'del-btn', '删除')
    btn.type = 'button'
    btn.title = '删除 ' + label
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      if (!window.confirm('确认删除 ' + label + ' ?')) return
      try {
        const url =
          kind === 'knowledge'
            ? '/api/knowledge/' + encodeURIComponent(item.paperId)
            : '/api/skills/' + encodeURIComponent(item.skillId)
        const res = await fetch(url, { method: 'DELETE' })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          window.alert('删除失败:' + (body.error || ('HTTP ' + res.status)))
          return
        }
        await refreshAllPanels()
        closeModal()
      } catch (err) {
        window.alert('删除失败:' + (err && err.message ? err.message : err))
      }
    })
    card.appendChild(btn)
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
    addDeleteButton(card, item)
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
  // 7. 论文解析流水线(拖拽 PDF → 解析 → 三库)
  // ─────────────────────────────────────────────

  function openModal(title, buildBody) {
    modalTitle.textContent = title
    modalBody.textContent = ''
    modalBody.appendChild(buildBody())
    modalBackdrop.classList.remove('hidden')
  }
  function closeModal() { modalBackdrop.classList.add('hidden') }
  modalClose.addEventListener('click', closeModal)
  modalBackdrop.addEventListener('click', (e) => { if (e.target === modalBackdrop) closeModal() })
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal() })

  function setPendingPdf(file) {
    pendingPdf = file
    dzText.classList.add('hidden')
    dzFile.classList.remove('hidden')
    dzFilename.textContent = file.name
    dropzone.classList.add('has-file')
  }
  function resetDropzone() {
    pendingPdf = null
    pdfFile.value = ''
    dzText.classList.remove('hidden')
    dzFile.classList.add('hidden')
    dzLoading.classList.add('hidden')
    parseButton.disabled = false
    dropzone.classList.remove('has-file')
  }

  pickPdf.addEventListener('click', () => pdfFile.click())
  pdfFile.addEventListener('change', () => {
    const file = pdfFile.files && pdfFile.files[0]
    if (file) setPendingPdf(file)
  })
  dzClear.addEventListener('click', resetDropzone)

  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover') })
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'))
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault()
    dropzone.classList.remove('dragover')
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]
    if (file && file.name.toLowerCase().endsWith('.pdf')) setPendingPdf(file)
    else alert('只支持 PDF 文件')
  })

  function flashWorkflow() {
    document.querySelectorAll('.wf-lib').forEach((node, i) => {
      node.classList.remove('flash')
      void node.offsetWidth
      node.style.animationDelay = (i * 120) + 'ms'
      node.classList.add('flash')
    })
  }

  parseButton.addEventListener('click', async () => {
    if (!pendingPdf) return
    parseButton.disabled = true
    dzLoading.classList.remove('hidden')
    wfParse.classList.add('working')
    try {
      const bytes = new Uint8Array(await pendingPdf.arrayBuffer())
      const res = await fetch('/api/ingest?filename=' + encodeURIComponent(pendingPdf.name), {
        method: 'POST',
        headers: { 'Content-Type': 'application/pdf' },
        body: bytes,
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert('解析失败:' + (body.error || ('HTTP ' + res.status)))
        return
      }
      openParseResultModal(body.result)
      flashWorkflow()
      await refreshAllPanels()
      resetDropzone()
    } catch (err) {
      alert('解析失败:' + (err && err.message ? err.message : err))
    } finally {
      parseButton.disabled = false
      dzLoading.classList.add('hidden')
      wfParse.classList.remove('working')
    }
  })

  function openParseResultModal(result) {
    openModal('📄 解析结果', () => {
      const wrap = el('div')
      const head = el('div', 'result-head')
      head.appendChild(el('div', 'result-title', result.title))
      const meta = el('div', 'result-meta')
      meta.appendChild(document.createTextNode(result.paperId + ' · ' + result.message))
      meta.appendChild(el('span', 'result-status ' + result.status, result.status))
      head.appendChild(meta)
      wrap.appendChild(head)

      const flow = el('div', 'result-flow')
      flow.appendChild(el('span', 'rf-node', '📄 PDF'))
      flow.appendChild(el('span', 'rf-arrow', '→'))
      flow.appendChild(el('span', 'rf-node', '⚙ 解析'))
      flow.appendChild(el('span', 'rf-arrow', '→'))
      flow.appendChild(el('span', 'rf-node hot', '📚 知识 ' + result.knowledge.length))
      flow.appendChild(el('span', 'rf-node hot', '🔧 工具 ' + result.tools.length))
      flow.appendChild(el('span', 'rf-node hot', '📋 技能 ' + (result.skill ? 1 : 0)))
      wrap.appendChild(flow)

      // A 知识库
      const a = el('div', 'result-block')
      a.appendChild(el('h4', null, '📚 知识库(A) · 本次抽取'))
      a.appendChild(el('span', 'rb-count', result.knowledge.length + ' 条原子知识页'))
      if (result.knowledge.length === 0) {
        a.appendChild(el('div', 'lib-empty', '未抽出知识页(可能解析率过低被隔离)'))
      } else {
        for (const note of result.knowledge) {
          const item = el('div', 'note-item')
          item.appendChild(el('div', 'ni-desc', '[' + note.kind + '] p.' + note.page + ' · ' + note.description))
          item.appendChild(el('div', 'ni-quote', '▶ ' + note.quote))
          a.appendChild(item)
        }
      }
      wrap.appendChild(a)

      // B 工具库
      const b = el('div', 'result-block')
      b.appendChild(el('h4', null, '🔧 工具库(B) · 已就绪'))
      b.appendChild(el('span', 'rb-count', result.tools.length + ' 个工具(论文方法 → 可执行工具)'))
      if (result.tools.length > 0) {
        const chips = el('div', 'tool-chips')
        for (const name of result.tools) chips.appendChild(el('span', 'tchip', name))
        b.appendChild(chips)
      } else {
        b.appendChild(el('div', 'lib-empty', '尚无生成工具'))
      }
      wrap.appendChild(b)

      // C 技能库
      const c = el('div', 'result-block')
      c.appendChild(el('h4', null, '📋 技能库(C) · 本次草案'))
      if (result.skill) {
        const box = el('div', 'skill-box')
        box.appendChild(el('div', 'sk-name', result.skill.name))
        box.appendChild(el('div', 'sk-id', result.skill.skillId))
        if (result.skill.warnings.length > 0) {
          box.appendChild(el('div', 'sk-warn', '待人工补齐 ' + result.skill.warnings.length + ' 项(见草案头注释)'))
        }
        c.appendChild(box)
      } else {
        c.appendChild(el('div', 'lib-empty', '未生成技能草案'))
      }
      wrap.appendChild(c)

      return wrap
    })
  }

  document.querySelectorAll('.wf-lib').forEach((btn) => {
    btn.addEventListener('click', () => openLibraryModal(btn.dataset.lib))
  })

  function openLibraryModal(lib) {
    const meta = PANEL_META[lib]
    const items = panelCache[lib] || []
    openModal(meta.title + ' · 全览', () => {
      const grid = el('div', 'lib-grid')
      if (items.length === 0) {
        grid.appendChild(el('div', 'lib-empty', '暂无数据。解析论文后会沉淀到这里。'))
      } else {
        for (const item of items) grid.appendChild(renderCard(item))
      }
      return grid
    })
  }

  // ─────────────────────────────────────────────
  // 8. 启动
  // ─────────────────────────────────────────────

  connect()
  refreshAllPanels()
})()
