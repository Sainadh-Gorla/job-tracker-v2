;(function () {
  const SITE_MATCHERS = [
    {
      name: 'linkedin',
      test: () =>
        location.hostname.includes('linkedin.com') &&
        (/\/jobs\/view\/\d+/.test(location.pathname) || location.pathname.startsWith('/jobs')),
    },
    {
      name: 'indeed',
      test: () =>
        location.hostname.includes('indeed.com') &&
        (location.pathname.includes('/viewjob') || location.search.includes('vjk=')),
    },
    {
      name: 'glassdoor',
      test: () =>
        location.hostname.includes('glassdoor.com') &&
        /job-listing|\/job\//i.test(location.pathname),
    },
    {
      name: 'amazonjobs',
      test: () => location.hostname.includes('amazon.jobs') || location.hostname.includes('hiring.amazon.com'),
    },
  ]

  // Each value is a list of selectors tried in order - the first one that
  // yields non-empty text wins. LinkedIn in particular churns its class names
  // often, so its list leans on structural selectors (h1, a link to a company
  // page) that survive redesigns better than generated class names do.
  const SITE_SELECTORS = {
    linkedin: {
      role: [
        '.job-details-jobs-unified-top-card__job-title',
        '.t-24',
        '.topcard__title',
        'h1',
      ],
      company: [
        '.job-details-jobs-unified-top-card__company-name',
        '.topcard__org-name-link',
        'a[href*="/company/"]',
      ],
      location: [
        '.job-details-jobs-unified-top-card__bullet',
        '.topcard__flavor--bullet',
      ],
      description: [
        '#job-details',
        '.jobs-description__content',
        '.jobs-box__html-content',
        '[class*="jobs-description"]',
        '.description__text',
      ],
    },
    indeed: {
      role: ['h1.jobsearch-JobInfoHeader-title', 'h1'],
      company: ['[data-testid="inlineHeader-companyName"]'],
      location: ['[data-testid="inlineHeader-companyLocation"]'],
      description: ['#jobDescriptionText'],
    },
    glassdoor: {
      role: ['[data-test="job-title"]', 'h1'],
      company: ['[data-test="employer-name"]'],
      location: ['[data-test="location"]'],
      description: ['.JobDetails_jobDescription__uW_fK', '[data-test="jobDescriptionContent"]'],
    },
    amazonjobs: {
      role: ['h1'],
      company: [],
      location: ['.location-icon', '[data-testid="job-location"]'],
      description: ['#job-detail-body', '.job-description'],
    },
  }

  function currentSiteKey() {
    const match = SITE_MATCHERS.find((m) => m.test())
    return match ? match.name : null
  }

  function isJobPostingPage() {
    return currentSiteKey() !== null
  }

  function text(selectors) {
    const list = Array.isArray(selectors) ? selectors : [selectors]
    for (const selector of list) {
      if (!selector) continue
      const el = document.querySelector(selector)
      if (el && el.textContent.trim()) return el.textContent.trim()
    }
    return ''
  }

  function isJobPostingType(item) {
    if (!item || !item['@type']) return false
    const type = item['@type']
    return type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'))
  }

  function getJsonLdJobPosting() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]')
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent)
        const roots = Array.isArray(data) ? data : [data]
        for (const root of roots) {
          const candidates = [root, ...(root['@graph'] || []), root.mainEntity].filter(Boolean)
          const posting = candidates.find(isJobPostingType)
          if (posting) return posting
        }
      } catch {
        // ignore malformed JSON-LD blocks
      }
    }
    return null
  }

  function jobTypeFromRaw(raw) {
    if (!raw) return ''
    const value = Array.isArray(raw) ? raw[0] : raw
    const normalized = String(value).toLowerCase().replace(/_/g, ' ')
    if (normalized.includes('full')) return 'Full-time'
    if (normalized.includes('part')) return 'Part-time'
    if (normalized.includes('contract') || normalized.includes('temp')) return 'Contract'
    if (normalized.includes('intern')) return 'Internship'
    return ''
  }

  function locationFromJsonLd(posting) {
    const loc = posting.jobLocation
    const entry = Array.isArray(loc) ? loc[0] : loc
    const address = entry?.address
    if (!address) return ''
    return [address.addressLocality, address.addressRegion, address.addressCountry].filter(Boolean).join(', ')
  }

  function extractFromJsonLd() {
    const posting = getJsonLdJobPosting()
    if (!posting) return null
    return {
      role: posting.title || '',
      company: posting.hiringOrganization?.name || '',
      location: locationFromJsonLd(posting),
      jobType: jobTypeFromRaw(posting.employmentType),
      description: (posting.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    }
  }

  // LinkedIn sets the tab title to "{Job Title} at {Company} | LinkedIn"
  // (sometimes prefixed with an unread-count badge like "(3) "). It's a
  // reliable source for role/company even when the top-card markup changes.
  function extractFromDocumentTitle() {
    if (currentSiteKey() !== 'linkedin') return null

    let title = document.title || ''
    title = title.replace(/^\(\d+\)\s*/, '')
    title = title.replace(/\s*[|\-–]\s*LinkedIn\s*$/i, '').trim()
    if (!title) return null

    const match = title.match(/^(.*?)\s+at\s+(.+)$/i)
    if (!match) return { role: title, company: '' }

    return { role: match[1].trim(), company: match[2].trim() }
  }

  function extractFromDom() {
    const siteKey = currentSiteKey()
    const selectors = SITE_SELECTORS[siteKey] || {}
    return {
      role: text(selectors.role),
      company: siteKey === 'amazonjobs' ? 'Amazon' : text(selectors.company),
      location: text(selectors.location),
      jobType: '',
      description: text(selectors.description),
    }
  }

  function extractJob() {
    const jsonLd = extractFromJsonLd()
    const titleParsed = extractFromDocumentTitle()
    const dom = extractFromDom()
    return {
      role: jsonLd?.role || titleParsed?.role || dom.role,
      company: jsonLd?.company || titleParsed?.company || dom.company,
      location: jsonLd?.location || dom.location,
      jobType: jsonLd?.jobType || dom.jobType,
      description: jsonLd?.description || dom.description,
      link: location.href,
      status: 'Applied',
      dateApplied: new Date().toISOString().slice(0, 10),
    }
  }

  function showToast(message, isError) {
    let toast = document.getElementById('jobtrack-toast')
    if (!toast) {
      toast = document.createElement('div')
      toast.id = 'jobtrack-toast'
      document.body.appendChild(toast)
    }
    toast.textContent = message
    toast.className = isError ? 'jobtrack-toast-error' : ''
    toast.style.display = 'block'
    clearTimeout(showToast._timer)
    showToast._timer = setTimeout(() => {
      toast.style.display = 'none'
    }, 3000)
  }

  async function saveExtractedJob() {
    const job = extractJob()
    if (!job.role || !job.company) {
      throw new Error('Could not find a job title and company on this page')
    }
    const response = await chrome.runtime.sendMessage({ type: 'SAVE_JOB', job })
    if (!response?.ok) {
      throw new Error(response?.error || 'Save failed')
    }
  }

  async function handleSaveClick(button) {
    button.disabled = true
    const originalText = button.textContent
    button.textContent = 'Saving…'
    try {
      await saveExtractedJob()
      showToast('Saved to JobTrack!')
    } catch (err) {
      showToast(err.message, true)
    } finally {
      button.disabled = false
      button.textContent = originalText
    }
  }

  function injectButton() {
    if (document.getElementById('jobtrack-save-button')) return
    const button = document.createElement('button')
    button.id = 'jobtrack-save-button'
    button.type = 'button'
    button.textContent = 'Save to JobTrack'
    button.addEventListener('click', () => handleSaveClick(button))
    document.body.appendChild(button)
  }

  function removeButton() {
    document.getElementById('jobtrack-save-button')?.remove()
  }

  function syncButton() {
    if (isJobPostingPage()) {
      injectButton()
    } else {
      removeButton()
    }
  }

  syncButton()

  // These sites are SPAs - the URL and DOM change without a full page load,
  // so watch for mutations to catch navigating into/out of a job posting.
  const observer = new MutationObserver(() => syncButton())
  observer.observe(document.body, { childList: true, subtree: true })

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'EXTRACT_AND_SAVE') {
      saveExtractedJob()
        .then(() => sendResponse({ ok: true }))
        .catch((err) => sendResponse({ ok: false, error: err.message }))
      return true
    }
    return false
  })
})()
