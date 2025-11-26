# Quran Dictionary

A web-based dictionary application for exploring Quranic terminology with Arabic text support, search functionality, and offline capabilities.

## Overview

The Quran Dictionary is a single-page web application that loads dictionary data from a Google Sheets CSV export, displays entries in both grid and table views, and provides advanced search and filtering capabilities. The application features Arabic text normalization for better search results, dark mode support, and robust offline handling with automatic retry mechanisms.

## Features

- **Search**: Search across Arabic terms, transliterations, translations, and meanings with Arabic diacritic normalization
- **Category Filtering**: Filter entries by category with color-coded badges
- **Sorting**: Sort by Arabic term, translation, or category (ascending/descending)
- **View Modes**: Toggle between grid (card) view and table view
- **Dark Mode**: Toggle between light and dark themes
- **Offline Support**: Automatic retry with exponential backoff when offline or network errors occur
- **Caching**: LocalStorage caching with 24-hour TTL for faster subsequent loads
- **Modal Details**: Click any entry to view full details in a modal
- **URL Parameters**: Shareable URLs with search query and category filters preserved
- **Responsive Design**: Works on desktop, tablet, and mobile devices

## How It Works

### Architecture

The application is built as a single JavaScript file (`app.js`) that uses an IIFE (Immediately Invoked Function Expression) to encapsulate all functionality. It exposes utility functions through the `window.QD` namespace.

### Data Flow

1. **Initialization**: On page load, the application checks LocalStorage cache for existing data
2. **Data Fetching**: If cache is empty or expired, fetches CSV data from Google Sheets
3. **CSV Parsing**: Parses the CSV response into JavaScript objects
4. **Data Normalization**: Maps CSV columns to standardized entry objects
5. **Caching**: Stores parsed data in LocalStorage with 24-hour TTL
6. **Rendering**: Displays entries based on current filters, search query, and view mode
7. **User Interactions**: Search, filtering, sorting, and view changes update the displayed results

### Offline Handling

When the network is unavailable or requests fail:
- An Arabic banner appears at the top indicating offline status
- Automatic retry with exponential backoff (5 attempts by default)
- Banner hides when connection is restored
- Cached data is used if available

## Function Documentation

### Utility Functions

#### `sleep(ms)`
Creates a delay promise for use in async functions.
- **Parameters**: `ms` (number) - Milliseconds to wait
- **Returns**: Promise that resolves after the delay

### Cache Utilities (`QD.cache`)

#### `createCache(namespace)`
Creates a namespaced LocalStorage cache with TTL support.
- **Parameters**: `namespace` (string) - Prefix for cache keys (default: 'qd')
- **Returns**: Object with `set`, `get`, `remove`, and `clearAll` methods

**Methods:**
- `set(key, value, ttlMs)` - Store value with optional expiration
- `get(key)` - Retrieve value (returns null if expired/not found)
- `remove(key)` - Delete specific cache entry
- `clearAll()` - Remove all entries for this namespace

### CSV Utilities (`QD.csv`)

#### `splitLines(text)`
Splits text into lines, handling CRLF/CR/LF and trimming BOM.
- **Parameters**: `text` (string) - Text to split
- **Returns**: Array of line strings

#### `trimBOM(text)`
Removes UTF-8 BOM if present at the start of text.
- **Parameters**: `text` (string) - Text that may contain BOM
- **Returns**: Text without BOM

#### `parseCSVLine(line, delimiter)`
Parses a single CSV line into fields, supporting quoted fields and escaped quotes.
- **Parameters**: 
  - `line` (string) - CSV line to parse
  - `delimiter` (string) - Field delimiter (default: ',')
- **Returns**: Array of field values

#### `detectRedirectHTML(text)`
Detects if a response contains HTML instead of expected CSV/text.
- **Parameters**: `text` (string) - Text to check
- **Returns**: Boolean indicating if HTML is detected

#### `parseCSV(text, delimiter)`
Parses CSV string into a 2D array (rows and columns).
- **Parameters**: 
  - `text` (string) - CSV text to parse
  - `delimiter` (string) - Field delimiter (default: ',')
- **Returns**: 2D array where each inner array is a row

#### `parseCSVToObjects(text, options)`
Parses CSV string into an array of objects using the first row as headers.
- **Parameters**: 
  - `text` (string) - CSV text to parse
  - `options` (object) - Parsing options
    - `delimiter` (string) - Field delimiter (default: ',')
    - `trimHeaders` (boolean) - Trim whitespace from headers (default: true)
- **Returns**: Array of objects with properties matching header names

### HTTP Utilities (`QD.http`)

#### `fetchWithRetry(url, options)`
Fetches a URL with retry logic, exponential backoff, timeout, and HTML redirect detection.
- **Parameters**: 
  - `url` (string) - URL to fetch
  - `options` (object) - Fetch options
    - `retries` (number) - Number of retry attempts (default: 3)
    - `backoffMs` (number) - Initial backoff delay (default: 1000)
    - `factor` (number) - Exponential backoff multiplier (default: 2)
    - `timeoutMs` (number) - Request timeout (default: 15000)
    - `acceptTypes` (string) - Accept header value
    - `method` (string) - HTTP method (default: 'GET')
    - `headers` (object) - Additional headers
    - `body` (*) - Request body
- **Returns**: Promise resolving to `{ok: boolean, status: number, text: string}`
- **Throws**: Error if all retry attempts fail

### Offline Utilities (`QD.offline`)

#### `createBanner()`
Creates an offline banner element if it doesn't exist.
- **Returns**: HTMLElement - Banner element

#### `showBanner()`
Shows the offline banner.

#### `hideBanner()`
Hides the offline banner.

#### `runWithOfflineRetry(loader, options)`
Runs an async loader function with offline detection and automatic retry.
- **Parameters**: 
  - `loader` (Function) - Async function to execute
  - `options` (object) - Retry options
    - `retries` (number) - Number of retry attempts (default: 5)
    - `backoffMs` (number) - Initial backoff delay (default: 2000)
    - `factor` (number) - Exponential backoff multiplier (default: 1.8)
    - `onSuccess` (Function) - Callback on successful execution
    - `onError` (Function) - Callback when all retries fail
- **Returns**: Promise resolving to the loader's result
- **Throws**: Error if all retry attempts fail

### Data Loading

#### `loadData()`
Loads dictionary data from cache or fetches from URL.
- Checks LocalStorage cache first
- If cache miss, fetches CSV from Google Sheets URL
- Parses CSV and normalizes data structure
- Caches parsed data with 24-hour TTL
- Handles offline scenarios with retry logic
- **Returns**: Promise<void>

### Initialization

#### `initializeApp()`
Initializes the application after data is loaded.
- Sets up dark mode
- Initializes view mode
- Renders category filters
- Parses URL parameters
- Updates sort buttons
- Applies filters
- Sets up event listeners

#### `initializeDarkMode()`
Initializes dark mode from localStorage or defaults to dark theme.
- Updates document class and icon visibility

#### `toggleDarkMode()`
Toggles between dark and light mode.
- Updates localStorage, document class, and icon visibility

#### `initializeViewMode()`
Initializes view mode from localStorage or defaults to grid.
- Updates view toggle button appearance

#### `toggleViewMode()`
Toggles view mode between grid and table.
- Saves preference to localStorage
- Re-renders results

#### `updateViewToggleButton()`
Updates view toggle button appearance based on current view mode.
- Shows/hides grid and table icons appropriately

### URL Parameter Handling

#### `parseURLParams()`
Parses URL parameters and applies them to filters.
- Supports 'q' or 'search' for search query
- Supports 'category' or 'categories' for category filters (comma-separated)

#### `updateURL()`
Updates URL with current filter state.
- Adds search query and selected categories as URL parameters
- Uses pushState to update URL without page reload

### Category Filtering

#### `getCategoryColor(category)`
Gets color for a category by finding the first dictionary entry with that category and a color.
- **Parameters**: `category` (string) - Category name to look up
- **Returns**: Color value or empty string if not found

#### `renderCategoryFilters()`
Extracts unique categories and renders filter badges.
- Creates clickable badge buttons for each category
- Applies colors if available
- Marks categories as active if in selectedCategories set

#### `toggleCategory(category, badgeElement)`
Toggles category filter on/off.
- **Parameters**: 
  - `category` (string) - Category to toggle
  - `badgeElement` (HTMLElement) - Badge button element to update
- Updates selectedCategories set and badge appearance

### Search and Filtering

#### `removeTashkeel(text)`
Removes Arabic diacritics (tashkeel) from text for search normalization.
- Normalizes various Alif forms and interchangeable characters
- Allows searching without needing exact diacritics
- **Parameters**: `text` (string) - Arabic text to normalize
- **Returns**: Normalized text without diacritics

#### `applyFilters()`
Applies search and category filters to dictionary data.
- Filters by category selection and search query
- Searches across all text fields (Arabic, transliteration, translation, meaning, Arabic description)
- Normalizes Arabic text for better search matching
- Updates filteredData, applies sorting, renders results, and updates URL

### Sorting

#### `applySort()`
Applies sorting to filtered data based on sortBy and sortOrder.
- Supports sorting by 'arabic', 'translation', or 'category'
- Normalizes Arabic text for consistent sorting

#### `handleSort(sortField)`
Handles sort button click.
- **Parameters**: `sortField` (string) - Field to sort by
- Toggles sort order if same field clicked
- Sets new field with ascending order if different field

#### `updateSortButtons()`
Updates sort button active states and order indicators.
- Highlights the active sort button
- Shows sort direction (↑ or ↓)

### Rendering

#### `renderResults()`
Renders dictionary entries based on view mode.
- Updates results count
- Shows/hides empty state
- Calls appropriate render function (grid or table)

#### `renderGridView()`
Renders dictionary entries as cards (grid view).
- Creates card elements with images in 16/9 containers with white backgrounds
- Always shows 16/9 container (white space if no image)
- Images are clickable and open the modal
- Applies color borders if available

#### `renderTableView()`
Renders dictionary entries as table (table view).
- Creates a table with all entry fields
- Images are contained within row height with white backgrounds
- Displays all fields: Image, Arabic Term, Transliteration, Translation, Meaning, Category, Arabic Description

### Modal

#### `openModal(item)`
Opens modal with item details.
- **Parameters**: `item` (object) - Dictionary entry object to display
- Populates modal with all entry information
- Shows image in 16/9 container if available
- Prevents body scrolling

#### `closeModal()`
Closes modal.
- Hides modal and restores body scroll

### Event Listeners

#### `setupEventListeners()`
Sets up all event listeners.
- Search input: Updates search query and applies filters
- Dark mode toggle: Toggles theme
- View toggle: Switches between grid and table views
- Sort buttons: Handles sorting
- Modal interactions: Close button, backdrop click, Escape key
- Browser navigation: Handles back/forward button for URL parameters

## Technical Details

### Data Structure

Each dictionary entry has the following structure:
```javascript
{
  id: string,
  imageUrl: string,
  arabic: string,
  transliteration: string,
  translation: string,
  meaning: string,
  arabicDescription: string,
  category: string,
  color: string
}
```

### Constants

- `CSV_URL`: Google Sheets CSV export URL
- `CACHE_KEY`: LocalStorage key for cached data ('quran-dict-data')
- `CACHE_TTL`: Cache expiration time (24 hours)

### State Variables

- `dictionaryData`: All loaded dictionary entries
- `filteredData`: Entries after applying filters and sorting
- `selectedCategories`: Set of selected category names
- `searchQuery`: Current search query string
- `viewMode`: Current view mode ('grid' or 'table')
- `sortBy`: Current sort field ('arabic', 'translation', or 'category')
- `sortOrder`: Current sort order ('asc' or 'desc')

### Image Styling

- **Grid View**: Images displayed in 16:9 aspect ratio containers with white backgrounds
- **Table View**: Images contained within row height with white backgrounds
- **Modal**: Images displayed in 16:9 aspect ratio containers with white backgrounds
- If no image is available, the white container space is still shown

### Arabic Text Normalization

The `removeTashkeel` function normalizes Arabic text by:
- Removing diacritics (tashkeel)
- Removing elongation marks (tatweel)
- Normalizing Alif variants (آ, أ, إ, ٱ → ا)
- Normalizing Ya variants (ى → ي)
- Normalizing Taa marbuta (ة → ه)

This allows users to search without needing exact diacritics.

## Usage

1. Open `index.html` in a web browser
2. The application automatically loads data from the configured Google Sheets CSV URL
3. Use the search box to search across all fields
4. Click category badges to filter by category
5. Use sort buttons to change sort order
6. Toggle between grid and table views using the view toggle button
7. Toggle dark mode using the dark mode toggle button
8. Click any entry to view full details in a modal
9. Share URLs with search queries and filters preserved in the URL parameters

## Browser Compatibility

- Modern browsers with ES6+ support
- LocalStorage support required
- Fetch API support required

## Dependencies

- Tailwind CSS (via CDN)
- Google Fonts (Scheherazade New for Arabic text)

