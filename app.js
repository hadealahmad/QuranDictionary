(function () {
	'use strict';

	// ============================================================================
	// QD NAMESPACE INITIALIZATION
	// ============================================================================
	/**
	 * Initialize the QD (Quran Dictionary) global namespace
	 * Provides utility functions for cache, CSV parsing, HTTP requests, and offline handling
	 */
	window.QD = window.QD || {};

	// ============================================================================
	// UTILITY FUNCTIONS
	// ============================================================================

	/**
	 * Sleep/delay utility function
	 * @param {number} ms - Milliseconds to wait
	 * @returns {Promise<void>} Promise that resolves after the specified delay
	 */
	const sleep = (ms) => new Promise(r => setTimeout(r, ms));

	// ============================================================================
	// CACHE UTILITIES
	// ============================================================================

	/**
	 * Creates a namespaced LocalStorage cache with TTL (Time To Live) support
	 * @param {string} namespace - Namespace prefix for cache keys (default: 'qd')
	 * @returns {Object} Cache object with set, get, remove, and clearAll methods
	 * 
	 * @example
	 * const cache = QD.cache.createCache('my-app');
	 * cache.set('key', { data: 'value' }, 3600000); // 1 hour TTL
	 * const value = cache.get('key');
	 */
	function createCache(namespace) {
		const ns = namespace || 'qd';
		const makeKey = (key) => `${ns}:${key}`;

		/**
		 * Store a value in cache with optional TTL
		 * @param {string} key - Cache key
		 * @param {*} value - Value to cache (will be JSON stringified)
		 * @param {number|null} ttlMs - Time to live in milliseconds (null = no expiration)
		 * @returns {boolean} True if successful, false on error
		 */
		function set(key, value, ttlMs) {
			try {
				const expiresAt = typeof ttlMs === 'number' ? Date.now() + ttlMs : null;
				const payload = { v: value, e: expiresAt };
				localStorage.setItem(makeKey(key), JSON.stringify(payload));
				return true;
			} catch (_) { return false; }
		}

		/**
		 * Retrieve a value from cache, checking expiration
		 * @param {string} key - Cache key
		 * @returns {*} Cached value or null if not found/expired
		 */
		function get(key) {
			try {
				const raw = localStorage.getItem(makeKey(key));
				if (!raw) return null;
				const payload = JSON.parse(raw);
				if (payload && typeof payload === 'object') {
					if (payload.e && Date.now() > payload.e) {
						localStorage.removeItem(makeKey(key));
						return null;
					}
					return payload.v;
				}
				return null;
			} catch (_) { return null; }
		}

		/**
		 * Remove a specific key from cache
		 * @param {string} key - Cache key to remove
		 */
		function remove(key) {
			try { localStorage.removeItem(makeKey(key)); } catch (_) {}
		}

		/**
		 * Clear all cache entries for this namespace
		 */
		function clearAll() {
			try {
				const prefix = `${ns}:`;
				for (let i = localStorage.length - 1; i >= 0; i--) {
					const k = localStorage.key(i);
					if (k && k.startsWith(prefix)) localStorage.removeItem(k);
				}
			} catch (_) {}
		}

		return { set, get, remove, clearAll };
	}

	window.QD.cache = { createCache };

	// ============================================================================
	// CSV UTILITIES
	// ============================================================================

	/**
	 * CSV parsing utilities with BOM handling, quoted field support, and HTML redirect detection
	 */
	const csv = {
		/**
		 * Split text into lines, handling CRLF/CR/LF line endings and trimming BOM
		 * @param {string} text - Text to split into lines
		 * @returns {string[]} Array of line strings
		 */
		splitLines(text) {
			if (!text || typeof text !== 'string') return [];
			const cleaned = csv.trimBOM(text).replace(/\r\n?|\n/g, '\n');
			return cleaned.split('\n');
		},

		/**
		 * Remove UTF-8 BOM (Byte Order Mark) if present at the start of text
		 * @param {string} text - Text that may contain BOM
		 * @returns {string} Text without BOM
		 */
		trimBOM(text) {
			if (text && text.charCodeAt(0) === 0xFEFF) {
				return text.slice(1);
			}
			return text;
		},

		/**
		 * Parse a single CSV line into fields, supporting quoted fields and escaped quotes
		 * Handles fields wrapped in double quotes and escaped quotes within quoted fields
		 * @param {string} line - CSV line to parse
		 * @param {string} delimiter - Field delimiter (default: ',')
		 * @returns {string[]} Array of field values
		 * 
		 * @example
		 * parseCSVLine('"Hello, World","Say ""Hi"""') // ['Hello, World', 'Say "Hi"']
		 */
		parseCSVLine(line, delimiter = ',') {
			const result = [];
			let current = '';
			let inQuotes = false;
			for (let i = 0; i < line.length; i++) {
				const char = line[i];
				if (char === '"') {
					if (inQuotes && line[i + 1] === '"') {
						current += '"';
						i++;
					} else {
						inQuotes = !inQuotes;
					}
				} else if (char === delimiter && !inQuotes) {
					result.push(current);
					current = '';
				} else {
					current += char;
				}
			}
			result.push(current);
			return result;
		},

		/**
		 * Detect if a response that should be CSV/text actually contains HTML
		 * Used to catch redirect pages or error pages returned as HTML
		 * @param {string} text - Text to check
		 * @returns {boolean} True if HTML detected
		 */
		detectRedirectHTML(text) {
			if (!text) return false;
			const trimmed = text.trim().slice(0, 200).toLowerCase();
			return trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html') || trimmed.includes('<title>');
		},

		/**
		 * Parse CSV string into an array of arrays (rows and columns)
		 * @param {string} text - CSV text to parse
		 * @param {string} delimiter - Field delimiter (default: ',')
		 * @returns {string[][]} 2D array where each inner array is a row
		 */
		parseCSV(text, delimiter = ',') {
			const lines = csv.splitLines(text);
			const rows = [];
			for (let i = 0; i < lines.length; i++) {
				const raw = lines[i];
				if (!raw || raw.trim() === '') continue;
				rows.push(csv.parseCSVLine(raw, delimiter));
			}
			return rows;
		},

		/**
		 * Parse CSV string into an array of objects using the first row as headers
		 * @param {string} text - CSV text to parse
		 * @param {Object} options - Parsing options
		 * @param {string} options.delimiter - Field delimiter (default: ',')
		 * @param {boolean} options.trimHeaders - Whether to trim whitespace from header names (default: true)
		 * @returns {Object[]} Array of objects with properties matching header names
		 * 
		 * @example
		 * parseCSVToObjects('Name,Age\nJohn,30\nJane,25') 
		 * // Returns: [{ Name: 'John', Age: '30' }, { Name: 'Jane', Age: '25' }]
		 */
		parseCSVToObjects(text, options = {}) {
			const { delimiter = ',', trimHeaders = true } = options;
			const rows = csv.parseCSV(text, delimiter);
			if (rows.length < 2) return [];
			let headers = rows[0].map(h => (trimHeaders ? (h || '').trim() : (h || '')));
			const data = [];
			for (let i = 1; i < rows.length; i++) {
				const row = rows[i];
				if (!row || row.length === 0) continue;
				const obj = {};
				for (let j = 0; j < headers.length; j++) {
					const key = headers[j] || `col_${j}`;
					obj[key] = (row[j] ?? '').toString().trim();
				}
				data.push(obj);
			}
			return data;
		}
	};

	window.QD.csv = csv;

	// ============================================================================
	// HTTP UTILITIES
	// ============================================================================

	/**
	 * Fetch with retry logic, exponential backoff, timeout, and HTML redirect detection
	 * Automatically retries failed requests with increasing delays between attempts
	 * @param {string} url - URL to fetch
	 * @param {Object} options - Fetch options
	 * @param {number} options.retries - Number of retry attempts (default: 3)
	 * @param {number} options.backoffMs - Initial backoff delay in milliseconds (default: 1000)
	 * @param {number} options.factor - Exponential backoff multiplier (default: 2)
	 * @param {number} options.timeoutMs - Request timeout in milliseconds (default: 15000)
	 * @param {string} options.acceptTypes - Accept header value (default: 'text/csv, text/plain, any')
	 * @param {string} options.method - HTTP method (default: 'GET')
	 * @param {Object} options.headers - Additional headers to include
	 * @param {*} options.body - Request body (for POST/PUT requests)
	 * @returns {Promise<{ok: boolean, status: number, text: string}>} Response object with ok flag, status, and text
	 * @throws {Error} If all retry attempts fail
	 * 
	 * @example
	 * const response = await QD.http.fetchWithRetry('https://example.com/data.csv', {
	 *   retries: 5,
	 *   timeoutMs: 10000
	 * });
	 */
	async function fetchWithRetry(url, options = {}) {
		const {
			retries = 3,
			backoffMs = 1000,
			factor = 2,
			timeoutMs = 15000,
			acceptTypes = 'text/csv, text/plain, */*',
			method = 'GET',
			headers = {},
			body
		} = options;

		let lastError;
		for (let attempt = 1; attempt <= retries; attempt++) {
			try {
				const controller = new AbortController();
				const id = setTimeout(() => controller.abort(), timeoutMs);
				const response = await fetch(url, {
					method,
					headers: { 'Accept': acceptTypes, 'Cache-Control': 'no-cache', ...headers },
					body,
					redirect: 'follow',
					signal: controller.signal
				});
				clearTimeout(id);

				const text = await response.text();
				if (!response.ok) {
					throw new Error(`HTTP error ${response.status}`);
				}

				// Detect HTML redirects disguised as CSV/text
				if (window.QD?.csv?.detectRedirectHTML && window.QD.csv.detectRedirectHTML(text)) {
					throw new Error('Received HTML instead of expected text response');
				}

				return { ok: true, status: response.status, text };
			} catch (error) {
				lastError = error;
				if (attempt < retries) {
					await sleep(backoffMs * Math.pow(factor, attempt - 1));
					continue;
				}
			}
		}

		return Promise.reject(lastError || new Error('fetchWithRetry failed'));
	}

	window.QD.http = { fetchWithRetry };

	// ============================================================================
	// OFFLINE UTILITIES
	// ============================================================================

	/**
	 * Creates an offline banner element if it doesn't exist
	 * @returns {HTMLElement} Banner element
	 */
	function createBanner() {
		const id = 'qd-offline-banner';
		if (document.getElementById(id)) return document.getElementById(id);
		const el = document.createElement('div');
		el.id = id;
		el.style.cssText = [
			'position:fixed','left:0','right:0','top:0','z-index:9999','display:none',
			'background: #A73F46','color:#fff','padding:8px 12px','text-align:center',
			'font-family: "IBM Plex Sans Arabic", sans-serif','box-shadow:0 2px 6px rgba(0,0,0,.2)'
		].join(';');
		el.innerHTML = 'لا يوجد اتصال بالإنترنت. سيتم إعادة المحاولة بالخلفية.';
		document.body.appendChild(el);
		return el;
	}

	/**
	 * Show the offline banner
	 */
	function showBanner() {
		const el = createBanner();
		el.style.display = 'block';
	}

	/**
	 * Hide the offline banner
	 */
	function hideBanner() {
		const el = createBanner();
		el.style.display = 'none';
	}

	/**
	 * Run an async loader function with offline detection and automatic retry
	 * Shows a banner when offline or on network errors, retries with exponential backoff
	 * @param {Function} loader - Async function to execute
	 * @param {Object} options - Retry options
	 * @param {number} options.retries - Number of retry attempts (default: 5)
	 * @param {number} options.backoffMs - Initial backoff delay in milliseconds (default: 2000)
	 * @param {number} options.factor - Exponential backoff multiplier (default: 1.8)
	 * @param {Function} options.onSuccess - Callback called on successful execution
	 * @param {Function} options.onError - Callback called when all retries fail
	 * @returns {Promise<*>} Result from the loader function
	 * @throws {Error} If all retry attempts fail
	 * 
	 * @example
	 * await QD.offline.runWithOfflineRetry(async () => {
	 *   return await fetchData();
	 * }, {
	 *   retries: 5,
	 *   onSuccess: (data) => console.log('Success!', data),
	 *   onError: (err) => console.error('Failed:', err)
	 * });
	 */
	async function runWithOfflineRetry(loader, options = {}) {
		const { retries = 5, backoffMs = 2000, factor = 1.8, onSuccess, onError } = options;
		let attempt = 0;

		if (!navigator.onLine) showBanner();

		while (attempt < retries) {
			try {
				const data = await loader();
				hideBanner();
				onSuccess && onSuccess(data);
				return data;
			} catch (err) {
				attempt++;
				showBanner();
				if (attempt >= retries) {
					onError && onError(err);
					throw err;
				}
				// progressive backoff
				await sleep(backoffMs * Math.pow(factor, attempt - 1));
			}
		}
	}

	window.QD.offline = { runWithOfflineRetry, showBanner, hideBanner };

	// ============================================================================
	// APPLICATION CONSTANTS AND STATE
	// ============================================================================

	const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ8oogghrnWECWF88DzTCKaEu9KlBjVq28-QV_eJn-rp9ZXTy49T0bEEUFJRv7F5aDKGnUGYaVMsIrp/pub?output=csv';
	const CACHE_KEY = 'quran-dict-data';
	const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

	let dictionaryData = [];
	let filteredData = [];
	let selectedCategories = new Set();
	let searchQuery = '';
	let viewMode = 'grid';
	let sortBy = 'arabic';
	let sortOrder = 'asc';

	const cache = window.QD?.cache?.createCache('quran-dict');
	const searchInput = document.getElementById('searchInput');
	const categoryFilters = document.getElementById('categoryFilters');
	const resultsContainer = document.getElementById('resultsContainer');
	const loadingState = document.getElementById('loadingState');
	const emptyState = document.getElementById('emptyState');
	const resultsCount = document.getElementById('resultsCount');
	const darkModeToggle = document.getElementById('darkModeToggle');
	const viewToggle = document.getElementById('viewToggle');
	const resultsTableContainer = document.getElementById('resultsTableContainer');
	const sunIcon = document.getElementById('sunIcon');
	const moonIcon = document.getElementById('moonIcon');
	const modal = document.getElementById('modal');
	const modalBackdrop = document.getElementById('modalBackdrop');
	const modalClose = document.getElementById('modalClose');

	// ============================================================================
	// DATA LOADING
	// ============================================================================

	/**
	 * Load dictionary data from cache or fetch from URL
	 * Checks cache first, then fetches from CSV URL with offline retry support
	 * Parses CSV data and normalizes it into dictionary entry objects
	 * @returns {Promise<void>}
	 */
	async function loadData() {
		try {
			// Check cache first
			const cached = cache?.get(CACHE_KEY);
			if (cached) {
				dictionaryData = cached;
				initializeApp();
				return;
			}

			// Fetch from URL with offline retry
			const loader = async () => {
				const response = await window.QD.http.fetchWithRetry(CSV_URL, {
					retries: 3,
					backoffMs: 1000,
					timeoutMs: 15000
				});

				if (!response.ok || !response.text) {
					throw new Error('Failed to fetch dictionary data');
				}

				// Parse CSV
				const parsed = window.QD.csv.parseCSVToObjects(response.text, {
					delimiter: ',',
					trimHeaders: true
				});

				// Normalize data structure
				dictionaryData = parsed.map(item => ({
					id: item['ID'] || '',
					imageUrl: item['Image'] || '',
					arabic: item['Arabic Term in Arabic'] || '',
					transliteration: item['Transliteration'] || '',
					translation: item['Translation in English'] || '',
					meaning: item['Meaning in English'] || '',
					arabicDescription: item['Meaning in Arabic'] || '',
					category: item['Category of the Term'] || '',
					color: item['color'] || item['Color'] || ''
				})).filter(item => item.arabic || item.translation);

				// Cache the data
				cache?.set(CACHE_KEY, dictionaryData, CACHE_TTL);

				return dictionaryData;
			};

			dictionaryData = await window.QD.offline.runWithOfflineRetry(loader, {
				retries: 5,
				backoffMs: 2000,
				onSuccess: () => {
					loadingState.classList.add('hidden');
				},
				onError: (err) => {
					loadingState.textContent = 'Failed to load dictionary data. Please check your connection.';
					console.error('Failed to load data:', err);
				}
			});

			initializeApp();
		} catch (error) {
			loadingState.textContent = 'Error loading dictionary data. Please refresh the page.';
			console.error('Error loading data:', error);
		}
	}

	// ============================================================================
	// INITIALIZATION
	// ============================================================================

	/**
	 * Initialize the application after data is loaded
	 * Sets up dark mode, view mode, category filters, URL params, sort buttons, filters, and event listeners
	 */
	function initializeApp() {
		loadingState.classList.add('hidden');
		initializeDarkMode();
		initializeViewMode();
		renderCategoryFilters();
		parseURLParams();
		updateSortButtons();
		applyFilters();
		setupEventListeners();
	}

	/**
	 * Initialize dark mode from localStorage or default to dark theme
	 * Updates document class and icon visibility
	 */
	function initializeDarkMode() {
		const savedTheme = localStorage.getItem('theme');
		const isDark = savedTheme === 'dark' || savedTheme === null; // Default to dark
		
		if (isDark) {
			document.documentElement.classList.add('dark');
			sunIcon.classList.remove('hidden');
			moonIcon.classList.add('hidden');
		} else {
			document.documentElement.classList.remove('dark');
			sunIcon.classList.add('hidden');
			moonIcon.classList.remove('hidden');
		}
	}

	/**
	 * Toggle between dark and light mode
	 * Updates localStorage, document class, and icon visibility
	 */
	function toggleDarkMode() {
		const isDark = document.documentElement.classList.contains('dark');
		
		if (isDark) {
			document.documentElement.classList.remove('dark');
			localStorage.setItem('theme', 'light');
			sunIcon.classList.add('hidden');
			moonIcon.classList.remove('hidden');
		} else {
			document.documentElement.classList.add('dark');
			localStorage.setItem('theme', 'dark');
			sunIcon.classList.remove('hidden');
			moonIcon.classList.add('hidden');
		}
	}

	/**
	 * Initialize view mode from localStorage or default to grid
	 * Updates view toggle button appearance
	 */
	function initializeViewMode() {
		const savedViewMode = localStorage.getItem('viewMode');
		if (savedViewMode === 'table' || savedViewMode === 'grid') {
			viewMode = savedViewMode;
		} else {
			viewMode = 'grid';
		}
		updateViewToggleButton();
	}

	/**
	 * Toggle view mode between grid and table
	 * Saves preference to localStorage and re-renders results
	 */
	function toggleViewMode() {
		viewMode = viewMode === 'grid' ? 'table' : 'grid';
		localStorage.setItem('viewMode', viewMode);
		updateViewToggleButton();
		renderResults();
	}

	/**
	 * Update view toggle button appearance based on current view mode
	 * Shows/hides grid and table icons appropriately
	 */
	function updateViewToggleButton() {
		if (!viewToggle) return;
		const gridIcon = viewToggle.querySelector('#gridIcon');
		const tableIcon = viewToggle.querySelector('#tableIcon');
		if (viewMode === 'grid') {
			gridIcon?.classList.remove('hidden');
			tableIcon?.classList.add('hidden');
		} else {
			gridIcon?.classList.add('hidden');
			tableIcon?.classList.remove('hidden');
		}
	}

	// ============================================================================
	// URL PARAMETER HANDLING
	// ============================================================================

	/**
	 * Parse URL parameters and apply them to filters
	 * Supports 'q' or 'search' for search query, 'category' or 'categories' for category filters
	 */
	function parseURLParams() {
		const params = new URLSearchParams(window.location.search);
		
		// Get search query from URL
		const urlQuery = params.get('q') || params.get('search');
		if (urlQuery) {
			searchQuery = urlQuery;
			searchInput.value = urlQuery;
		}
		
		// Get categories from URL (comma-separated)
		const urlCategories = params.get('category') || params.get('categories');
		if (urlCategories) {
			selectedCategories = new Set(urlCategories.split(',').filter(Boolean));
			// Update badge states (will be applied after renderCategoryFilters)
		}
	}

	/**
	 * Update URL with current filter state
	 * Adds search query and selected categories as URL parameters
	 * Uses pushState to update URL without page reload
	 */
	function updateURL() {
		const params = new URLSearchParams();
		
		if (searchQuery.trim()) {
			params.set('q', searchQuery.trim());
		}
		
		if (selectedCategories.size > 0) {
			params.set('category', Array.from(selectedCategories).join(','));
		}
		
		const newURL = params.toString() 
			? `${window.location.pathname}?${params.toString()}`
			: window.location.pathname;
		
		window.history.pushState({}, '', newURL);
	}

	// ============================================================================
	// CATEGORY FILTERING
	// ============================================================================

	/**
	 * Get color for a category by finding the first dictionary entry with that category and a color
	 * @param {string} category - Category name to look up
	 * @returns {string} Color value or empty string if not found
	 */
	function getCategoryColor(category) {
		const item = dictionaryData.find(d => d.category === category && d.color);
		return item ? item.color : '';
	}

	/**
	 * Extract unique categories and render filter badges
	 * Creates clickable badge buttons for each category, applying colors if available
	 * Marks categories as active if they're in the selectedCategories set
	 */
	function renderCategoryFilters() {
		const categories = [...new Set(dictionaryData.map(item => item.category).filter(Boolean))].sort();
		
		categoryFilters.innerHTML = '';
		
		categories.forEach(category => {
			const badge = document.createElement('button');
			badge.className = 'badge';
			badge.textContent = category;
			badge.setAttribute('data-category', category);
			
			// Apply color if available
			const color = getCategoryColor(category);
			if (color) {
				badge.style.borderColor = color;
				badge.style.color = color;
			}
			
			// If category is selected (from URL params), mark as active and maintain color
			if (selectedCategories.has(category)) {
				badge.classList.add('active');
				if (color) {
					badge.style.backgroundColor = 'transparent';
				}
			}
			
			badge.addEventListener('click', () => toggleCategory(category, badge));
			categoryFilters.appendChild(badge);
		});
	}

	/**
	 * Toggle category filter on/off
	 * Updates selectedCategories set and badge appearance
	 * @param {string} category - Category to toggle
	 * @param {HTMLElement} badgeElement - Badge button element to update
	 */
	function toggleCategory(category, badgeElement) {
		const color = getCategoryColor(category);
		
		if (selectedCategories.has(category)) {
			selectedCategories.delete(category);
			badgeElement.classList.remove('active');
			// Restore original color when inactive
			if (color) {
				badgeElement.style.borderColor = color;
				badgeElement.style.color = color;
			}
		} else {
			selectedCategories.add(category);
			badgeElement.classList.add('active');
			// Maintain color when active
			if (color) {
				badgeElement.style.borderColor = color;
				badgeElement.style.color = color;
				badgeElement.style.backgroundColor = 'transparent';
			}
		}
		
		applyFilters();
	}

	// ============================================================================
	// SEARCH AND FILTERING
	// ============================================================================

	/**
	 * Remove Arabic diacritics (tashkeel) from text for search normalization
	 * Also normalizes various Alif forms and interchangeable characters
	 * This allows searching without needing exact diacritics
	 * @param {string} text - Arabic text to normalize
	 * @returns {string} Normalized text without diacritics
	 */
	function removeTashkeel(text) {
		if (!text || typeof text !== 'string') return text;
		
		return text
			// Remove Arabic diacritics (Unicode ranges: 064B-065F, 0670, 06D6-06ED)
			.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u06F0-\u06F9]/g, '')
			// Remove tatweel (elongation mark)
			.replace(/[\u0640]/g, '')
			// Normalize all Alif variants to regular Alif (ا)
			.replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627') // آ أ إ ٱ → ا
			// Normalize Ya variants (ي and ى are interchangeable)
			.replace(/\u0649/g, '\u064A') // ى → ي
			// Normalize Taa marbuta and Haa (ة and ه are interchangeable)
			.replace(/\u0629/g, '\u0647'); // ة → ه
	}

	/**
	 * Apply search and category filters to dictionary data
	 * Filters by category selection and search query (searches across all text fields)
	 * Normalizes Arabic text for better search matching
	 * Updates filteredData, applies sorting, renders results, and updates URL
	 */
	function applyFilters() {
		const query = searchQuery.toLowerCase().trim();
		
		// Normalize Arabic query by removing tashkeel
		const normalizedQuery = removeTashkeel(query);
		
		filteredData = dictionaryData.filter(item => {
			// Category filter
			if (selectedCategories.size > 0 && !selectedCategories.has(item.category)) {
				return false;
			}

			// Search filter
			if (!query) {
				return true;
			}

			// Search across all fields, normalizing Arabic text
			const searchableText = [
				removeTashkeel(item.arabic),
				item.transliteration,
				item.translation,
				item.meaning,
				removeTashkeel(item.arabicDescription)
			].join(' ').toLowerCase();

			return searchableText.includes(normalizedQuery);
		});

		applySort();
		renderResults();
		updateURL();
	}

	// ============================================================================
	// SORTING
	// ============================================================================

	/**
	 * Apply sorting to filtered data based on sortBy and sortOrder
	 * Supports sorting by 'arabic', 'translation', or 'category'
	 * Normalizes Arabic text for consistent sorting
	 */
	function applySort() {
		filteredData.sort((a, b) => {
			let aVal, bVal;

			switch (sortBy) {
				case 'arabic':
					aVal = removeTashkeel(a.arabic || '').toLowerCase();
					bVal = removeTashkeel(b.arabic || '').toLowerCase();
					break;
				case 'translation':
					aVal = (a.translation || '').toLowerCase();
					bVal = (b.translation || '').toLowerCase();
					break;
				case 'category':
					aVal = (a.category || '').toLowerCase();
					bVal = (b.category || '').toLowerCase();
					break;
				default:
					return 0;
			}

			if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
			if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
			return 0;
		});
	}

	/**
	 * Handle sort button click
	 * Toggles sort order if same field clicked, otherwise sets new field with ascending order
	 * @param {string} sortField - Field to sort by ('arabic', 'translation', or 'category')
	 */
	function handleSort(sortField) {
		if (sortBy === sortField) {
			// Toggle order if same field
			sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
		} else {
			// New field, default to ascending
			sortBy = sortField;
			sortOrder = 'asc';
		}
		updateSortButtons();
		applySort();
		renderResults();
	}

	/**
	 * Update sort button active states and order indicators
	 * Highlights the active sort button and shows sort direction (↑ or ↓)
	 */
	function updateSortButtons() {
		const sortButtons = document.querySelectorAll('[data-sort]');
		sortButtons.forEach(button => {
			const field = button.getAttribute('data-sort');
			if (field === sortBy) {
				button.classList.add('active');
				// Update button text to show order
				const orderIcon = button.querySelector('.sort-order');
				if (orderIcon) {
					orderIcon.textContent = sortOrder === 'asc' ? '↑' : '↓';
				}
			} else {
				button.classList.remove('active');
			}
		});
	}

	// ============================================================================
	// RENDERING
	// ============================================================================

	/**
	 * Render dictionary entries based on view mode
	 * Updates results count, shows/hides empty state, and calls appropriate render function
	 */
	function renderResults() {
		// Update results count
		const totalCount = dictionaryData.length;
		const filteredCount = filteredData.length;
		if (resultsCount) {
			if (filteredCount === totalCount) {
				resultsCount.textContent = `${totalCount} ${totalCount === 1 ? 'entry' : 'entries'}`;
			} else {
				resultsCount.textContent = `Showing ${filteredCount} of ${totalCount} ${totalCount === 1 ? 'entry' : 'entries'}`;
			}
		}

		if (filteredData.length === 0) {
			emptyState.classList.remove('hidden');
			resultsContainer.innerHTML = '';
			if (resultsTableContainer) {
				resultsTableContainer.innerHTML = '';
			}
			return;
		}

		emptyState.classList.add('hidden');

		if (viewMode === 'table') {
			renderTableView();
		} else {
			renderGridView();
		}
	}

	/**
	 * Render dictionary entries as cards (grid view)
	 * Creates card elements with images in 16/9 containers with white backgrounds
	 * Images are clickable and open the modal
	 */
	function renderGridView() {
		resultsContainer.innerHTML = '';
		if (resultsTableContainer) {
			resultsTableContainer.innerHTML = '';
			resultsTableContainer.classList.add('hidden');
		}
		resultsContainer.classList.remove('hidden');

		filteredData.forEach(item => {
			const card = document.createElement('div');
			card.className = 'card cursor-pointer hover:shadow-lg transition-shadow';
			
			// Apply color border if available
			if (item.color) {
				card.style.borderColor = item.color;
				card.style.borderWidth = '2px';
			}
			
			card.addEventListener('click', () => openModal(item));

			// Image in 16/9 container with white background (always show container, even if no image)
			const imageContainer = document.createElement('div');
			imageContainer.className = 'image-container-16-9';
			imageContainer.style.marginBottom = '1rem';
			if (item.imageUrl) {
				const img = document.createElement('img');
				img.src = item.imageUrl;
				img.alt = item.arabic || item.translation || 'Dictionary entry';
				img.className = 'image-16-9';
				img.onerror = function() {
					this.style.display = 'none';
					// Keep container visible even if image fails to load
				};
				imageContainer.appendChild(img);
			}
			card.appendChild(imageContainer);

			const cardContent = document.createElement('div');
			cardContent.className = 'card-content';

			// Arabic term
			if (item.arabic) {
				const arabicTitle = document.createElement('h2');
				arabicTitle.className = 'card-title arabic mb-2';
				arabicTitle.textContent = item.arabic;
				cardContent.appendChild(arabicTitle);
			}

			// Transliteration
			if (item.transliteration) {
				const transliteration = document.createElement('p');
				transliteration.className = 'text-sm italic mb-2 opacity-70';
				transliteration.textContent = item.transliteration;
				cardContent.appendChild(transliteration);
			}

			// Translation
			if (item.translation) {
				const translation = document.createElement('p');
				translation.className = 'text-base font-semibold';
				translation.textContent = item.translation;
				cardContent.appendChild(translation);
			}

			card.appendChild(cardContent);
			resultsContainer.appendChild(card);
		});
	}

	/**
	 * Render dictionary entries as table (table view)
	 * Creates a table with all entry fields
	 * Images are contained within row height with white backgrounds
	 */
	function renderTableView() {
		if (resultsContainer) {
			resultsContainer.innerHTML = '';
			resultsContainer.classList.add('hidden');
		}
		if (!resultsTableContainer) return;

		resultsTableContainer.innerHTML = '';
		resultsTableContainer.classList.remove('hidden');

		const table = document.createElement('table');
		table.className = 'results-table';

		// Table header
		const thead = document.createElement('thead');
		const headerRow = document.createElement('tr');
		const headers = ['Image', 'Arabic Term', 'Transliteration', 'Translation', 'Meaning', 'Category', 'Arabic Description'];
		headers.forEach(headerText => {
			const th = document.createElement('th');
			th.textContent = headerText;
			headerRow.appendChild(th);
		});
		thead.appendChild(headerRow);
		table.appendChild(thead);

		// Table body
		const tbody = document.createElement('tbody');
		filteredData.forEach(item => {
			const row = document.createElement('tr');

			// Image with white background, contained in row
			const imageCell = document.createElement('td');
			if (item.imageUrl) {
				const imgContainer = document.createElement('div');
				imgContainer.className = 'table-image-container';
				const img = document.createElement('img');
				img.src = item.imageUrl;
				img.alt = item.arabic || item.translation || '';
				img.className = 'table-image';
				img.onerror = function() {
					this.style.display = 'none';
					imgContainer.style.display = 'none';
				};
				imgContainer.appendChild(img);
				imageCell.appendChild(imgContainer);
			}
			row.appendChild(imageCell);

			// Arabic term
			const arabicCell = document.createElement('td');
			if (item.arabic) {
				arabicCell.className = 'arabic';
				arabicCell.textContent = item.arabic;
			}
			row.appendChild(arabicCell);

			// Transliteration
			const transliterationCell = document.createElement('td');
			transliterationCell.className = 'italic opacity-70';
			transliterationCell.textContent = item.transliteration || '';
			row.appendChild(transliterationCell);

			// Translation
			const translationCell = document.createElement('td');
			translationCell.textContent = item.translation || '';
			row.appendChild(translationCell);

			// Meaning
			const meaningCell = document.createElement('td');
			meaningCell.textContent = item.meaning || '';
			row.appendChild(meaningCell);

			// Category
			const categoryCell = document.createElement('td');
			if (item.category) {
				const categoryBadge = document.createElement('span');
				categoryBadge.className = 'badge text-xs';
				categoryBadge.textContent = item.category;
				categoryBadge.style.cursor = 'default';
				categoryBadge.style.pointerEvents = 'none';
				
				// Apply color if available
				if (item.color) {
					categoryBadge.style.borderColor = item.color;
					categoryBadge.style.color = item.color;
				}
				
				categoryCell.appendChild(categoryBadge);
			}
			row.appendChild(categoryCell);

			// Arabic Description
			const arabicDescCell = document.createElement('td');
			if (item.arabicDescription) {
				arabicDescCell.className = 'arabic';
				arabicDescCell.textContent = item.arabicDescription;
			}
			row.appendChild(arabicDescCell);

			tbody.appendChild(row);
		});
		table.appendChild(tbody);
		resultsTableContainer.appendChild(table);
	}

	// ============================================================================
	// MODAL
	// ============================================================================

	/**
	 * Open modal with item details
	 * Populates modal with all entry information including image in 16/9 container
	 * @param {Object} item - Dictionary entry object to display
	 */
	function openModal(item) {
		if (!modal) return;

		// Populate modal content
		const modalImage = document.getElementById('modalImage');
		const modalImageContainer = document.getElementById('modalImageContainer');
		const modalArabic = document.getElementById('modalArabic');
		const modalTransliteration = document.getElementById('modalTransliteration');
		const modalTranslation = document.getElementById('modalTranslation');
		const modalMeaning = document.getElementById('modalMeaning');
		const modalCategory = document.getElementById('modalCategory');
		const modalArabicDesc = document.getElementById('modalArabicDesc');

		if (modalImage && modalImageContainer) {
			if (item.imageUrl) {
				modalImage.src = item.imageUrl;
				modalImageContainer.style.display = 'block';
				modalImage.onerror = function() {
					modalImageContainer.style.display = 'none';
				};
			} else {
				modalImageContainer.style.display = 'none';
			}
		}

		if (modalArabic) modalArabic.textContent = item.arabic || '';
		if (modalTransliteration) modalTransliteration.textContent = item.transliteration || '';
		if (modalTranslation) modalTranslation.textContent = item.translation || '';
		if (modalMeaning) modalMeaning.textContent = item.meaning || '';
		if (modalCategory) {
			if (item.category) {
				modalCategory.textContent = item.category;
				modalCategory.style.display = 'inline-block';
			} else {
				modalCategory.style.display = 'none';
			}
		}
		if (modalArabicDesc) modalArabicDesc.textContent = item.arabicDescription || '';

		// Show modal
		modal.classList.remove('hidden');
		document.body.style.overflow = 'hidden';
	}

	/**
	 * Close modal
	 * Hides modal and restores body scroll
	 */
	function closeModal() {
		if (!modal) return;
		modal.classList.add('hidden');
		document.body.style.overflow = '';
	}

	// ============================================================================
	// EVENT LISTENERS
	// ============================================================================

	/**
	 * Setup all event listeners
	 * Handles search input, dark mode toggle, view toggle, sort buttons, modal interactions, and browser navigation
	 */
	function setupEventListeners() {
		// Search input
		searchInput.addEventListener('input', (e) => {
			searchQuery = e.target.value;
			applyFilters();
		});

		// Dark mode toggle
		if (darkModeToggle) {
			darkModeToggle.addEventListener('click', toggleDarkMode);
		}

		// View toggle
		if (viewToggle) {
			viewToggle.addEventListener('click', toggleViewMode);
		}

		// Sort buttons
		const sortButtons = document.querySelectorAll('[data-sort]');
		sortButtons.forEach(button => {
			button.addEventListener('click', () => {
				const sortField = button.getAttribute('data-sort');
				handleSort(sortField);
			});
		});

		// Modal close
		if (modalClose) {
			modalClose.addEventListener('click', closeModal);
		}

		if (modalBackdrop) {
			modalBackdrop.addEventListener('click', closeModal);
		}

		// Close modal on Escape key
		document.addEventListener('keydown', (e) => {
			if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
				closeModal();
			}
		});

		// Handle browser back/forward navigation
		window.addEventListener('popstate', () => {
			parseURLParams();
			applyFilters();
		});
	}

	// ============================================================================
	// INITIALIZATION
	// ============================================================================

	// Initialize on DOM ready
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', loadData);
	} else {
		loadData();
	}
})();
