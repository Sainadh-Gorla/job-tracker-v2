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
        '.jobs-unified-top-card__bullet',
        '.topcard__flavor--bullet',
        '.tvm__text.tvm__text--low-emphasis',
        '.tvm__text',
      ],
      description: [
        '.jobs-description__content .jobs-box__html-content',
        '.jobs-description__content',
        '.jobs-description',
        '.jobs-box__html-content',
        '.job-details-jobs-unified-top-card__job-description',
        '[data-test-id="job-details"]',
        '[class*="jobs-description"]',
        '#job-details',
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

  // Different candidate selectors can each match *something* (a heading, a
  // truncated summary panel, the actual body), but only one of them holds the
  // full text. Rather than trusting selector order, check every matching
  // element across every selector and keep whichever text is longest - the
  // full job description is reliably the largest block on the page.
  // When `label` is set, logs every selector's match count/length so we can
  // see exactly which one (if any) is finding the description.
  // Uses innerText (not textContent) so rendered paragraph/line breaks are
  // preserved instead of being flattened into one run-on string.
  function longestText(selectors, label) {
    const list = Array.isArray(selectors) ? selectors : [selectors]
    let best = ''
    for (const selector of list) {
      if (!selector) continue
      const matches = document.querySelectorAll(selector)
      if (label) {
        console.log(`[JobTrack] ${label} selector "${selector}": ${matches.length} match(es)`)
      }
      matches.forEach((el, i) => {
        const value = el.innerText.trim()
        if (label) {
          console.log(`[JobTrack]   [${i}] length=${value.length}`, value.slice(0, 100))
        }
        if (value.length > best.length) best = value
      })
    }
    return best
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

  // LinkedIn's current layout wraps the description in an unlabeled div, but
  // it's reliably preceded by an "About the job" <h2>. That heading survives
  // class-name churn far better than any generated class does, so it's tried
  // first for LinkedIn before falling back to the selector list below.
  function extractDescriptionFromHeading() {
    const headings = Array.from(document.querySelectorAll('h2'))
    const aboutHeading = headings.find((h) => h.textContent.trim() === 'About the job')
    if (!aboutHeading) return ''

    // closest('div') tends to land on the heading's immediate wrapper, which
    // often holds little more than the heading itself. Walk up ancestor by
    // ancestor instead, stopping at the first one whose text is long enough
    // to actually be the description body rather than just the heading.
    let el = aboutHeading.parentElement
    while (el && el.tagName !== 'BODY') {
      // innerText (not textContent) - it respects the browser's rendered
      // layout, so block-level boundaries (paragraphs, divs, <br>s) come
      // through as real line breaks instead of being flattened into one
      // run-on string. It also skips text hidden via CSS, which textContent
      // would have included as extra noise.
      const rendered = el.innerText.trim()
      if (rendered.length > 200) {
        return rendered
      }
      el = el.parentElement
    }
    return ''
  }

  // LinkedIn doesn't expose job type through a dedicated element - it's just
  // one of the plain-text bullets in the top card (e.g. "Acme Robotics ·
  // Remote · Full-time"). Scan those same bullet elements (the "job details
  // card" area) for one of the known employment-type words rather than
  // guessing at another selector.
  const JOB_TYPE_KEYWORDS = ['Full-time', 'Part-time', 'Contract', 'Hybrid', 'Remote']

  function findJobType(value) {
    return JOB_TYPE_KEYWORDS.find((keyword) => new RegExp(`\\b${keyword}\\b`, 'i').test(value)) || ''
  }

  function extractJobTypeFromBullets(bulletSelectors) {
    const list = Array.isArray(bulletSelectors) ? bulletSelectors : [bulletSelectors]
    for (const selector of list) {
      if (!selector) continue
      for (const el of document.querySelectorAll(selector)) {
        const match = findJobType(el.textContent.trim())
        if (match) return match
      }
    }
    return ''
  }

  // A location-shaped bit of text: mentions Remote/Hybrid/On-site, or has the
  // "City, State"/"City, Country" comma shape. Used to pick a location out of
  // a pool of candidate strings that weren't already pulled apart from a
  // known combined container.
  function looksLikeLocation(value) {
    if (!value) return false
    if (/\b(remote|hybrid|on-?site)\b/i.test(value)) return true
    return /,\s*[A-Za-z]/.test(value)
  }

  // Prefer a concrete employment-type word (Full-time/Part-time/Contract/
  // Hybrid) as the job type over a bare "Remote" value - when both show up
  // together (a common "Remote · Full-time" pairing), "Remote" reads more
  // like the location than the employment type.
  function pickJobType(values) {
    const typeValues = values.filter((value) => findJobType(value))
    const chosen = typeValues.find((value) => findJobType(value) !== 'Remote') || typeValues[0] || ''
    return { jobType: chosen ? findJobType(chosen) : '', jobTypeValue: chosen }
  }

  function parseLocationAndJobType(rawText) {
    const segments = rawText
      .split(/[·•|]/)
      .map((segment) => segment.trim())
      .filter(Boolean)
      // Drop applicant counts and relative post dates - never location or job type.
      .filter((segment) => !/applicant|\bago\b|reposted|promoted/i.test(segment))

    const { jobType, jobTypeValue } = pickJobType(segments)
    const location = segments.find((segment) => segment !== jobTypeValue) || ''
    return { location, jobType }
  }

  // LinkedIn's top card often has a single container (no "tagline") holding
  // location, posting age, and applicant count together as segments joined
  // by "·", e.g. "San Francisco, CA · 2 weeks ago · Full-time · 500
  // applicants". Try that container under a couple of selector variants
  // (LinkedIn's exact class name has moved before), logging what each finds,
  // then fall back to scanning every ".tvm__text" element on the page for
  // one that looks like a location.
  function extractFromPrimaryDescriptionContainer() {
    const containerAttempts = [
      '.job-details-jobs-unified-top-card__tertiary-description',
      '.jobs-unified-top-card__subtitle-primary-grouping',
      '[class*="tertiary-description"]',
      '[class*="subtitle"]',
      '.job-details-jobs-unified-top-card__primary-description-without-tagline',
      '[class*="primary-description"]',
    ]

    for (const selector of containerAttempts) {
      const container = document.querySelector(selector)
      if (!container) {
        console.log(`[JobTrack] location/jobType: "${selector}" - no match`)
        continue
      }
      const rawText = container.innerText.trim()
      console.log(`[JobTrack] location/jobType: "${selector}" found, text="${rawText}"`)
      if (!rawText) continue
      const parsed = parseLocationAndJobType(rawText)
      if (parsed.location || parsed.jobType) return parsed
    }

    const tvmTextEls = Array.from(document.querySelectorAll('.tvm__text'))
    console.log(`[JobTrack] location/jobType: ".tvm__text" fallback - ${tvmTextEls.length} match(es)`)
    const values = tvmTextEls
      .map((el, i) => {
        const value = el.innerText.trim()
        console.log(`[JobTrack]   [.tvm__text ${i}] "${value}"`)
        return value
      })
      .filter(Boolean)

    const { jobType, jobTypeValue } = pickJobType(values)
    const location = values.find((value) => value !== jobTypeValue && looksLikeLocation(value)) || ''

    return { location, jobType }
  }

  // LinkedIn now renders location/job-type text inside spans with randomly
  // generated, non-semantic class names (e.g. "aafc18e8 _662f01e9") that
  // can't be targeted by selector at all. Instead, find them by *position*
  // (near the very top of the page) and *text shape* ("Sunnyvale, CA", or an
  // exact "Remote"/"Hybrid"/"On-site"/"Full-time" match) - or, when LinkedIn
  // renders them as checkmark pills ("✓ On-site"), by that leading glyph.
  // The (?![A-Za-z]) guard means the two-letter code must be followed by a
  // space or the end of the string, never another letter - otherwise "Acme
  // Robotics, LLC" matches "Acme Robotics, LL" (the first two letters of
  // "LLC"). NON_STATE_ABBREVIATIONS is a second, independent check against
  // known business-entity suffixes, in case the lookahead alone isn't enough.
  const LOCATION_SHAPE_PATTERN = /^[A-Z][a-zA-Z\s]+,\s*[A-Z]{2}(?![A-Za-z])$/
  const NON_STATE_ABBREVIATIONS = new Set(['LLC', 'INC', 'LTD', 'LLP'])
  // "Memphis Metropolitan Area", "Greater Memphis Area", "Greater New York
  // City Area" - LinkedIn's other common way of expressing a metro location.
  const METRO_AREA_PATTERN = /^(?:Greater\s+)?[A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*\s+(?:Metropolitan\s+)?Area$/
  const LOCATION_EXACT_WORDS = ['remote', 'hybrid', 'on-site', 'onsite']
  const JOB_TYPE_EXACT_WORDS = ['full-time', 'part-time', 'contract', 'internship']
  // Substring (not exact-match) job-type words, for badge elements whose text
  // is just the word itself with no checkmark character at all (the
  // checkmark is often a separate icon/pseudo-element, not part of the text).
  const JOB_TYPE_SUBSTRINGS = ['Full-time', 'Part-time', 'Contract', 'Internship']

  function isNearTopOfPage(el, thresholdRatio) {
    const rect = el.getBoundingClientRect()
    const docHeight = document.documentElement.scrollHeight || document.body.scrollHeight || 1
    const absoluteTop = rect.top + window.scrollY
    return absoluteTop >= 0 && absoluteTop <= docHeight * thresholdRatio
  }

  function stripLeadingCheckmark(text) {
    return text.replace(/^[✓✔]\s*/, '').trim()
  }

  function matchLocationShape(rawText) {
    const value = stripLeadingCheckmark(rawText)
    if (LOCATION_SHAPE_PATTERN.test(value) && !NON_STATE_ABBREVIATIONS.has(value.slice(-2).toUpperCase())) {
      return value
    }
    if (METRO_AREA_PATTERN.test(value)) return value
    if (LOCATION_EXACT_WORDS.includes(value.toLowerCase())) return value
    return ''
  }

  function matchJobTypeShape(rawText) {
    const value = stripLeadingCheckmark(rawText)
    return JOB_TYPE_EXACT_WORDS.includes(value.toLowerCase()) ? value : ''
  }

  // Broader than matchJobTypeShape: matches the word appearing *anywhere* in
  // short badge-like text, not just as the element's entire exact content.
  // Capped at 40 chars so it can't fire on a mention buried in a long
  // paragraph of the job description.
  function findJobTypeSubstring(rawText) {
    const value = stripLeadingCheckmark(rawText)
    if (value.length > 40) return ''
    return JOB_TYPE_SUBSTRINGS.find((word) => value.includes(word)) || ''
  }

  function scanTopOfPageSpans() {
    const spans = Array.from(document.querySelectorAll('span'))
    const topSpans = spans.filter((el) => isNearTopOfPage(el, 0.2))
    console.log(
      `[JobTrack] top-of-page span scan: ${spans.length} spans on page, ${topSpans.length} within first 20%`,
    )

    let location = ''
    let jobType = ''

    for (const el of topSpans) {
      const raw = el.innerText?.trim()
      if (!raw) continue

      if (!location) {
        const match = matchLocationShape(raw)
        if (match) {
          location = match
          console.log(`[JobTrack] top-of-page span scan: location match "${match}"`)
        }
      }
      if (!jobType) {
        const match = matchJobTypeShape(raw)
        if (match) {
          jobType = match
          console.log(`[JobTrack] top-of-page span scan: jobType match "${match}"`)
        }
      }
      if (location && jobType) break
    }

    return { location, jobType }
  }

  // Originally gated on a leading "✓"/"✔" character, on the assumption the
  // checkmark was part of the element's text. In practice it's often a
  // separate icon (SVG/pseudo-element) instead, so the badge's own text is
  // just "Full-time" with nothing to detect a checkmark from. Scan every
  // short span/div instead - matchLocationShape/findJobTypeSubstring are
  // strict enough (anchored shape / capped length) to stay safe doing that.
  function scanBadgeElements() {
    const candidates = Array.from(document.querySelectorAll('span, div')).filter((el) => {
      const raw = el.innerText?.trim()
      return raw && raw.length <= 60
    })
    console.log(`[JobTrack] badge element scan: ${candidates.length} candidate short span/div element(s)`)

    let location = ''
    let jobType = ''

    for (const el of candidates) {
      const raw = el.innerText.trim()

      if (!location) {
        const match = matchLocationShape(raw)
        if (match) {
          location = match
          console.log(`[JobTrack] badge element scan: location match "${match}" (from text "${raw}")`)
        }
      }
      if (!jobType) {
        const match = findJobTypeSubstring(raw)
        if (match) {
          jobType = match
          console.log(`[JobTrack] badge element scan: jobType match "${match}" (from text "${raw}")`)
        }
      }
      if (location && jobType) break
    }

    return { location, jobType }
  }

  // Last-resort location source: many postings format the tab title as
  // "Role | City, State | Salary", and even when they don't, the description
  // body often opens with a "City, State" mention before anything else.
  // Same (?![A-Za-z]) guard as LOCATION_SHAPE_PATTERN above - without it this
  // matches "Valence, LL" out of a company name like "Valence, LLC".
  const LOCATION_PATTERN = /([A-Z][a-z]+(?:\s[A-Z][a-z]+)*,\s*[A-Z]{2})(?![A-Za-z])/

  function isRealLocationMatch(match) {
    if (!match) return false
    const code = match[1].slice(-2).toUpperCase()
    return !NON_STATE_ABBREVIATIONS.has(code)
  }

  function extractLocationFromTitleOrDescription(descriptionText) {
    const titleMatch = document.title.match(LOCATION_PATTERN)
    console.log(`[JobTrack] location: document.title="${document.title}", match=${titleMatch ? titleMatch[1] : null}`)
    if (isRealLocationMatch(titleMatch)) return titleMatch[1]

    const firstLine = (descriptionText || '').split('\n')[0] || ''
    const descriptionMatch = firstLine.match(LOCATION_PATTERN)
    console.log(
      `[JobTrack] location: description first line="${firstLine}", match=${descriptionMatch ? descriptionMatch[1] : null}`,
    )
    if (isRealLocationMatch(descriptionMatch)) return descriptionMatch[1]

    return ''
  }

  function extractFromDom() {
    const siteKey = currentSiteKey()
    const selectors = SITE_SELECTORS[siteKey] || {}

    let description = ''
    if (siteKey === 'linkedin') {
      description = extractDescriptionFromHeading()
      if (description) {
        console.log(`[JobTrack] description: found via "About the job" heading, length=${description.length}`)
      }
    }

    if (!description) {
      description = longestText(selectors.description, 'description')
    }
    if (!description) {
      // Last resort: the <article> element (if present) wraps the entire
      // job posting body on many sites, including LinkedIn. innerText again,
      // so this fallback doesn't reintroduce the run-on-string problem.
      const article = document.querySelector('article')
      description = article ? article.innerText.trim() : ''
      console.log(`[JobTrack] description: no selector matched, <article> fallback length=${description.length}`)
    }

    let location = ''
    let jobType = ''
    if (siteKey === 'linkedin') {
      const badgeResult = scanBadgeElements()
      location = badgeResult.location
      jobType = badgeResult.jobType
      if (location) console.log(`[JobTrack] location: found via badge element scan: "${location}"`)
      if (jobType) console.log(`[JobTrack] jobType: found via badge element scan: "${jobType}"`)

      if (!location || !jobType) {
        const spanScan = scanTopOfPageSpans()
        if (!location && spanScan.location) {
          location = spanScan.location
          console.log(`[JobTrack] location: found via top-of-page span scan: "${location}"`)
        }
        if (!jobType && spanScan.jobType) {
          jobType = spanScan.jobType
          console.log(`[JobTrack] jobType: found via top-of-page span scan: "${jobType}"`)
        }
      }

      if (!location || !jobType) {
        const primary = extractFromPrimaryDescriptionContainer()
        if (!location && primary.location) {
          location = primary.location
          console.log(`[JobTrack] location: found via primary-description container: "${location}"`)
        }
        if (!jobType && primary.jobType) {
          jobType = primary.jobType
          console.log(`[JobTrack] jobType: found via primary-description container: "${jobType}"`)
        }
      }
    }
    if (!location) location = text(selectors.location)
    if (siteKey === 'linkedin' && !jobType) jobType = extractJobTypeFromBullets(selectors.location)
    if (siteKey === 'linkedin' && !location) {
      location = extractLocationFromTitleOrDescription(description)
      if (location) console.log(`[JobTrack] location: found via title/description fallback: "${location}"`)
    }

    return {
      role: text(selectors.role),
      company: siteKey === 'amazonjobs' ? 'Amazon' : text(selectors.company),
      location,
      jobType,
      description,
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

  // LinkedIn renders the job description client-side after the initial page
  // load, so it's often missing if we read the DOM immediately. Poll a few
  // known containers for up to 3s and resolve as soon as one has content
  // (via a MutationObserver watching for DOM changes, backstopped by a
  // 200ms interval in case the description is inserted without a
  // childList/subtree mutation we'd catch), or after the timeout - whichever
  // comes first - so extraction proceeds with whatever is available either way.
  const DESCRIPTION_WAIT_SELECTORS = ['#job-details', '.jobs-description__content', 'article']

  function descriptionIsReady() {
    // The "About the job" heading is checked first (and reliably) - see
    // extractDescriptionFromHeading below - before falling back to the
    // generic selector list.
    if (extractDescriptionFromHeading()) return true
    return DESCRIPTION_WAIT_SELECTORS.some((selector) => {
      const el = document.querySelector(selector)
      return el && el.textContent.trim()
    })
  }

  function waitForDescription(timeoutMs = 3000, intervalMs = 200) {
    return new Promise((resolve) => {
      if (descriptionIsReady()) {
        resolve()
        return
      }

      const start = Date.now()
      let settled = false

      function finish(reason) {
        if (settled) return
        settled = true
        clearInterval(poller)
        mutationObserver.disconnect()
        console.log(`[JobTrack] waitForDescription: ${reason} after ${Date.now() - start}ms`)
        resolve()
      }

      const poller = setInterval(() => {
        if (descriptionIsReady()) {
          finish('description found (poll)')
        } else if (Date.now() - start >= timeoutMs) {
          finish('timed out - extracting whatever is available')
        }
      }, intervalMs)

      const mutationObserver = new MutationObserver(() => {
        if (descriptionIsReady()) {
          finish('description found (mutation)')
        }
      })
      mutationObserver.observe(document.body, { childList: true, subtree: true, characterData: true })
    })
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
    if (currentSiteKey() === 'linkedin') {
      await waitForDescription()
    }
    const job = extractJob()
    if (!job.role || !job.company) {
      throw new Error('Could not find a job title and company on this page')
    }
    console.log('[JobTrack] Extracted job data:', JSON.stringify(job, null, 2))
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
