(function () {
	'use strict';

	const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ8oogghrnWECWF88DzTCKaEu9KlBjVq28-QV_eJn-rp9ZXTy49T0bEEUFJRv7F5aDKGnUGYaVMsIrp/pub?output=csv';
	const CACHE_KEY = 'quran-dict-data';
	const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

	let dictionaryData = [];
	let filteredData = [];
	let selectedCategories = new Set();
	let searchQuery = '';
	let currentPage = 1;
	let isInitialLoad = true;
	const ITEMS_PER_PAGE = 9;

	const cache = window.SZ?.cache?.createCache('quran-dict');
	const searchInput = document.getElementById('searchInput');
	const categoryFilters = document.getElementById('categoryFilters');
	const resultsContainer = document.getElementById('resultsContainer');
	const loadingState = document.getElementById('loadingState');
	const emptyState = document.getElementById('emptyState');
	const resultsCount = document.getElementById('resultsCount');
	const paginationContainer = document.getElementById('paginationContainer');
	const darkModeToggle = document.getElementById('darkModeToggle');
	const sunIcon = document.getElementById('sunIcon');
	const moonIcon = document.getElementById('moonIcon');

	/**
	 * Load dictionary data from cache or fetch from URL
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
				const response = await window.SZ.http.fetchWithRetry(CSV_URL, {
					retries: 3,
					backoffMs: 1000,
					timeoutMs: 15000
				});

				if (!response.ok || !response.text) {
					throw new Error('Failed to fetch dictionary data');
				}

				// Parse CSV
				const parsed = window.SZ.csv.parseCSVToObjects(response.text, {
					delimiter: ',',
					trimHeaders: true
				});

				// Normalize data structure
				dictionaryData = parsed.map(item => ({
					arabic: item['Arabic Term in Arabic'] || '',
					transliteration: item['Transliteration'] || '',
					translation: item['Translation in English'] || '',
					meaning: item['Meaning in English'] || '',
					category: item['Category of the Term'] || ''
				})).filter(item => item.arabic || item.translation);

				// Cache the data
				cache?.set(CACHE_KEY, dictionaryData, CACHE_TTL);

				return dictionaryData;
			};

			dictionaryData = await window.SZ.offline.runWithOfflineRetry(loader, {
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

	/**
	 * Initialize the application after data is loaded
	 */
	function initializeApp() {
		loadingState.classList.add('hidden');
		initializeDarkMode();
		renderCategoryFilters();
		parseURLParams();
		applyFilters();
		setupEventListeners();
	}

	/**
	 * Initialize dark mode from localStorage or default to dark
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
	 * Toggle dark mode
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
	 * Parse URL parameters and apply them to filters
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
			// Update badge states
			document.querySelectorAll('[data-category]').forEach(badge => {
				const category = badge.getAttribute('data-category');
				if (selectedCategories.has(category)) {
					badge.classList.add('active');
				}
			});
		}
		
		// Get page number from URL
		const urlPage = params.get('page');
		if (urlPage) {
			const pageNum = parseInt(urlPage, 10);
			if (pageNum > 0) {
				currentPage = pageNum;
			}
		}
	}

	/**
	 * Update URL with current filter state
	 */
	function updateURL() {
		const params = new URLSearchParams();
		
		if (searchQuery.trim()) {
			params.set('q', searchQuery.trim());
		}
		
		if (selectedCategories.size > 0) {
			params.set('category', Array.from(selectedCategories).join(','));
		}
		
		if (currentPage > 1) {
			params.set('page', currentPage.toString());
		}
		
		const newURL = params.toString() 
			? `${window.location.pathname}?${params.toString()}`
			: window.location.pathname;
		
		window.history.pushState({}, '', newURL);
	}

	/**
	 * Extract unique categories and render filter badges
	 */
	function renderCategoryFilters() {
		const categories = [...new Set(dictionaryData.map(item => item.category).filter(Boolean))].sort();
		
		categoryFilters.innerHTML = '';
		
		categories.forEach(category => {
			const badge = document.createElement('button');
			badge.className = 'badge';
			badge.textContent = category;
			badge.setAttribute('data-category', category);
			badge.addEventListener('click', () => toggleCategory(category, badge));
			categoryFilters.appendChild(badge);
		});
	}

	/**
	 * Toggle category filter
	 */
	function toggleCategory(category, badgeElement) {
		if (selectedCategories.has(category)) {
			selectedCategories.delete(category);
			badgeElement.classList.remove('active');
		} else {
			selectedCategories.add(category);
			badgeElement.classList.add('active');
		}
		applyFilters();
	}

	/**
	 * Remove Arabic diacritics (tashkeel) from text for search normalization
	 * Also normalizes various Alif forms and interchangeable characters
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
	 * Apply search and category filters
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
				item.meaning
			].join(' ').toLowerCase();

			return searchableText.includes(normalizedQuery);
		});

		// Reset to first page when filters change (but preserve page on initial load from URL)
		if (isInitialLoad) {
			// On initial load, check if page is set in URL
			const params = new URLSearchParams(window.location.search);
			if (!params.get('page')) {
				currentPage = 1;
			}
			isInitialLoad = false;
		} else {
			// On subsequent filter changes, always reset to page 1
			currentPage = 1;
		}
		renderResults();
		updateURL();
	}

	/**
	 * Render dictionary entries as cards
	 */
	function renderResults() {
		resultsContainer.innerHTML = '';

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
			paginationContainer.innerHTML = '';
			return;
		}

		emptyState.classList.add('hidden');

		// Calculate pagination
		const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE);
		const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
		const endIndex = startIndex + ITEMS_PER_PAGE;
		const paginatedData = filteredData.slice(startIndex, endIndex);

		// Update results count with pagination info
		if (resultsCount && totalPages > 1) {
			resultsCount.textContent = `Showing ${startIndex + 1}-${Math.min(endIndex, filteredCount)} of ${filteredCount} ${filteredCount === 1 ? 'entry' : 'entries'} (Page ${currentPage} of ${totalPages})`;
		}

		paginatedData.forEach(item => {
			const card = document.createElement('div');
			card.className = 'card';

			const cardHeader = document.createElement('div');
			cardHeader.className = 'card-header';

			// Arabic term
			if (item.arabic) {
				const arabicTitle = document.createElement('h2');
				arabicTitle.className = 'card-title arabic mb-2';
				arabicTitle.textContent = item.arabic;
				cardHeader.appendChild(arabicTitle);
			}

			// English translation (if different from Arabic)
			if (item.translation && item.translation !== item.arabic) {
				const translationTitle = document.createElement('h3');
				translationTitle.className = 'text-lg font-semibold mb-2';
				translationTitle.textContent = item.translation;
				cardHeader.appendChild(translationTitle);
			}

			card.appendChild(cardHeader);

			const cardContent = document.createElement('div');
			cardContent.className = 'card-content';

			// Transliteration
			if (item.transliteration) {
				const transliteration = document.createElement('p');
				transliteration.className = 'text-sm italic mb-3 opacity-70';
				transliteration.textContent = item.transliteration;
				cardContent.appendChild(transliteration);
			}

			// Meaning
			if (item.meaning) {
				const meaning = document.createElement('p');
				meaning.className = 'text-sm leading-relaxed mb-3';
				meaning.textContent = item.meaning;
				cardContent.appendChild(meaning);
			}

			// Category badge
			if (item.category) {
				const categoryBadge = document.createElement('span');
				categoryBadge.className = 'badge text-xs';
				categoryBadge.textContent = item.category;
				categoryBadge.style.cursor = 'default';
				categoryBadge.style.pointerEvents = 'none';
				cardContent.appendChild(categoryBadge);
			}

			card.appendChild(cardContent);
			resultsContainer.appendChild(card);
		});

		// Render pagination
		renderPagination(totalPages);
	}

	/**
	 * Render pagination controls
	 */
	function renderPagination(totalPages) {
		if (totalPages <= 1) {
			paginationContainer.innerHTML = '';
			return;
		}

		paginationContainer.innerHTML = '';
		const pagination = document.createElement('nav');
		pagination.className = 'pagination';
		pagination.setAttribute('aria-label', 'Pagination');

		// Previous button
		const prevButton = document.createElement('button');
		prevButton.className = 'pagination-item';
		prevButton.textContent = 'Previous';
		if (currentPage === 1) {
			prevButton.classList.add('disabled');
		}
		prevButton.addEventListener('click', () => {
			if (currentPage > 1) {
				currentPage--;
				renderResults();
				updateURL();
				window.scrollTo({ top: 0, behavior: 'smooth' });
			}
		});
		pagination.appendChild(prevButton);

		// Page numbers
		const maxVisiblePages = 5;
		let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
		let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

		if (endPage - startPage < maxVisiblePages - 1) {
			startPage = Math.max(1, endPage - maxVisiblePages + 1);
		}

		if (startPage > 1) {
			const firstPage = document.createElement('button');
			firstPage.className = 'pagination-item';
			firstPage.textContent = '1';
			firstPage.addEventListener('click', () => {
				currentPage = 1;
				renderResults();
				updateURL();
				window.scrollTo({ top: 0, behavior: 'smooth' });
			});
			pagination.appendChild(firstPage);

			if (startPage > 2) {
				const ellipsis = document.createElement('span');
				ellipsis.className = 'pagination-item disabled';
				ellipsis.textContent = '...';
				pagination.appendChild(ellipsis);
			}
		}

		for (let i = startPage; i <= endPage; i++) {
			const pageButton = document.createElement('button');
			pageButton.className = 'pagination-item';
			if (i === currentPage) {
				pageButton.classList.add('active');
			}
			pageButton.textContent = i.toString();
			pageButton.addEventListener('click', () => {
				currentPage = i;
				renderResults();
				updateURL();
				window.scrollTo({ top: 0, behavior: 'smooth' });
			});
			pagination.appendChild(pageButton);
		}

		if (endPage < totalPages) {
			if (endPage < totalPages - 1) {
				const ellipsis = document.createElement('span');
				ellipsis.className = 'pagination-item disabled';
				ellipsis.textContent = '...';
				pagination.appendChild(ellipsis);
			}

			const lastPage = document.createElement('button');
			lastPage.className = 'pagination-item';
			lastPage.textContent = totalPages.toString();
			lastPage.addEventListener('click', () => {
				currentPage = totalPages;
				renderResults();
				updateURL();
				window.scrollTo({ top: 0, behavior: 'smooth' });
			});
			pagination.appendChild(lastPage);
		}

		// Next button
		const nextButton = document.createElement('button');
		nextButton.className = 'pagination-item';
		nextButton.textContent = 'Next';
		if (currentPage === totalPages) {
			nextButton.classList.add('disabled');
		}
		nextButton.addEventListener('click', () => {
			if (currentPage < totalPages) {
				currentPage++;
				renderResults();
				updateURL();
				window.scrollTo({ top: 0, behavior: 'smooth' });
			}
		});
		pagination.appendChild(nextButton);

		paginationContainer.appendChild(pagination);
	}

	/**
	 * Setup event listeners
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

		// Handle browser back/forward navigation
		window.addEventListener('popstate', () => {
			parseURLParams();
			applyFilters();
		});
	}

	// Initialize on DOM ready
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', loadData);
	} else {
		loadData();
	}
})();

