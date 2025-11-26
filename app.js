(function () {
	'use strict';

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

	const cache = window.SZ?.cache?.createCache('quran-dict');
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
		initializeViewMode();
		renderCategoryFilters();
		parseURLParams();
		updateSortButtons();
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
			// Update badge states (will be applied after renderCategoryFilters)
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
		
		const newURL = params.toString() 
			? `${window.location.pathname}?${params.toString()}`
			: window.location.pathname;
		
		window.history.pushState({}, '', newURL);
	}

	/**
	 * Get color for a category (returns first color found for that category)
	 */
	function getCategoryColor(category) {
		const item = dictionaryData.find(d => d.category === category && d.color);
		return item ? item.color : '';
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
	 * Toggle category filter
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
				item.meaning,
				removeTashkeel(item.arabicDescription)
			].join(' ').toLowerCase();

			return searchableText.includes(normalizedQuery);
		});

		applySort();
		renderResults();
		updateURL();
	}

	/**
	 * Render dictionary entries based on view mode
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
	 * Initialize view mode from localStorage or default to grid
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
	 */
	function toggleViewMode() {
		viewMode = viewMode === 'grid' ? 'table' : 'grid';
		localStorage.setItem('viewMode', viewMode);
		updateViewToggleButton();
		renderResults();
	}

	/**
	 * Update view toggle button appearance
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

	/**
	 * Render dictionary entries as cards (grid view)
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

			// Image
			if (item.imageUrl) {
				const imageContainer = document.createElement('div');
				imageContainer.className = 'w-full h-48 overflow-hidden rounded-t-lg';
				const img = document.createElement('img');
				img.src = item.imageUrl;
				img.alt = item.arabic || item.translation || 'Dictionary entry';
				img.className = 'w-full h-full object-cover';
				img.onerror = function() {
					this.style.display = 'none';
					imageContainer.style.display = 'none';
				};
				imageContainer.appendChild(img);
				card.appendChild(imageContainer);
			}

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

			// Image
			const imageCell = document.createElement('td');
			if (item.imageUrl) {
				const img = document.createElement('img');
				img.src = item.imageUrl;
				img.alt = item.arabic || item.translation || '';
				img.className = 'w-16 h-16 object-cover rounded';
				img.onerror = function() {
					this.style.display = 'none';
				};
				imageCell.appendChild(img);
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

	/**
	 * Apply sorting to filtered data
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
	 * Update sort button active states
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

	/**
	 * Open modal with item details
	 */
	function openModal(item) {
		if (!modal) return;

		// Populate modal content
		const modalImage = document.getElementById('modalImage');
		const modalArabic = document.getElementById('modalArabic');
		const modalTransliteration = document.getElementById('modalTransliteration');
		const modalTranslation = document.getElementById('modalTranslation');
		const modalMeaning = document.getElementById('modalMeaning');
		const modalCategory = document.getElementById('modalCategory');
		const modalArabicDesc = document.getElementById('modalArabicDesc');

		if (modalImage) {
			if (item.imageUrl) {
				modalImage.src = item.imageUrl;
				modalImage.style.display = 'block';
				modalImage.onerror = function() {
					this.style.display = 'none';
				};
			} else {
				modalImage.style.display = 'none';
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
	 */
	function closeModal() {
		if (!modal) return;
		modal.classList.add('hidden');
		document.body.style.overflow = '';
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

	// Initialize on DOM ready
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', loadData);
	} else {
		loadData();
	}
})();

