document.addEventListener('DOMContentLoaded', () => {
    const downloadForm = document.getElementById('downloadForm');
    const statusText = document.getElementById('statusText');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const songDetails = document.getElementById('songDetails');
    const songsList = document.getElementById('songsList');
    const urlInput = document.getElementById('url');
    const paginationButtons = document.getElementById('paginationButtons');
    const searchInput = document.getElementById('search');
    const downloadAllBtn = document.getElementById('downloadAllBtn');
    const playlistAlbumName = document.getElementById('playlistAlbumName');

    let allSongs = []; // To store all songs data
    let currentPlaylist = null; // To store current playlist/album details
    let currentPage = 1; // Current page number
    const songsPerPage = 15; // Number of songs per page

    // Add paste event listener to the urlInput field
    urlInput.addEventListener('paste', function(event) {
        // Prevent default paste behavior
        event.preventDefault();

        // Get pasted text from clipboard
        let pastedText = '';
        if (event.clipboardData && event.clipboardData.getData) {
            pastedText = event.clipboardData.getData('text/plain');
        } else if (window.clipboardData && window.clipboardData.getData) {
            pastedText = window.clipboardData.getData('Text');
        }

        // Insert pasted text into urlInput field
        this.value = pastedText.trim();
        
        // Automatically fetch songs when URL is pasted
        fetchAndDisplaySongs();
    });

    downloadForm.addEventListener('submit', function(event) {
        event.preventDefault();
        fetchAndDisplaySongs();
    });

    searchInput.addEventListener('input', function() {
        const searchTerm = this.value.trim().toLowerCase();
        const filteredSongs = allSongs.filter(song => {
            return song.title.toLowerCase().includes(searchTerm);
        });
        currentPage = 1;
        displaySongs(currentPage, filteredSongs);
    });

    downloadAllBtn.addEventListener('click', () => {
        downloadAllSongs();
        searchInput.style.display = 'none'; // Hide search bar on "Download All" click
    });

    function fetchAndDisplaySongs() {
        const url = urlInput.value.trim();
    
        // Show loading spinner and clear previous messages
        loadingSpinner.style.display = 'block';
        setStatusMessage('', ''); // Clear status message
    
        // Validate Spotify URL
        if (!isValidSpotifyUrl(url)) {
            loadingSpinner.style.display = 'none';
            setStatusMessage('Please provide a valid Spotify URL.', 'error');
            return;
        }
    
        // Fetch song details from Spotify
        fetch(`/song-details?url=${encodeURIComponent(url)}`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            // Hide loading spinner
            loadingSpinner.style.display = 'none';
    
            // Check content type (playlist or album)
            if (data.contentType === 'playlist' || data.contentType === 'album') {
                // Show playlist/album name
                playlistAlbumName.textContent = data.name;
                playlistAlbumName.style.display = 'block';
                
                // Show search input and download all button
                searchInput.style.display = 'block';
    
                // Update download all button text with song count
                const songCount = data.songs.length;
                downloadAllBtn.textContent = `Download All (${songCount} songs)`;
                downloadAllBtn.style.display = 'block';
            } else {
                // Hide playlist/album name, search input, and download all button
                playlistAlbumName.style.display = 'none';
                searchInput.style.display = 'none';
                downloadAllBtn.style.display = 'none';
            }
    
            // Update allSongs and display songs
            allSongs = data.songs;
            currentPage = 1;
            displaySongs(currentPage);
            
            // Clear URL input field after fetching songs
            urlInput.value = '';
        })
        .catch(error => {
            console.error('Error fetching song details:', error);
            setStatusMessage('Error fetching song details.', 'error');
            loadingSpinner.style.display = 'none';
        });
    }
    

    function displaySongs(page, songs = allSongs) {
        // Clear previous song details and pagination buttons
        songsList.innerHTML = '';
        paginationButtons.innerHTML = '';

        const totalPages = Math.ceil(songs.length / songsPerPage);

        if (page < 1) {
            page = 1;
        } else if (page > totalPages) {
            page = totalPages;
        }

        const startIndex = (page - 1) * songsPerPage;
        const endIndex = Math.min(startIndex + songsPerPage, songs.length);

        // Display songs for the current page
        const pageSongs = songs.slice(startIndex, endIndex);
        pageSongs.forEach((song, index) => {
            const songCard = document.createElement('div');
            songCard.classList.add('card', 'mb-3');

            const cardBody = document.createElement('div');
            cardBody.classList.add('card-body');

            const songThumbnail = document.createElement('img');
            songThumbnail.classList.add('img-fluid', 'song-thumbnail');
            songThumbnail.src = song.thumbnail;
            songThumbnail.alt = 'Song Thumbnail';

            const songTitle = document.createElement('h5');
            songTitle.classList.add('card-title');
            songTitle.textContent = song.title;

            const downloadButton = document.createElement('button');
            downloadButton.classList.add('btn', 'btn-success', 'mr-2');
            downloadButton.textContent = 'Download';
            downloadButton.addEventListener('click', () => {
                downloadSong(song.url, song.title, index);
            });

            const spinner = document.createElement('div');
            spinner.classList.add('loader', 'mx-auto', 'spinner-' + index);
            spinner.style.display = 'none';

            cardBody.appendChild(songThumbnail);
            cardBody.appendChild(songTitle);
            cardBody.appendChild(downloadButton);
            cardBody.appendChild(spinner);

            songCard.appendChild(cardBody);
            songsList.appendChild(songCard);
        });

        // Create pagination buttons
        if (totalPages > 1) {
            const previousButton = createPageButton('Previous', page - 1);
            paginationButtons.appendChild(previousButton);

            for (let i = 1; i <= totalPages; i++) {
                const pageButton = createPageButton(i, i);
                paginationButtons.appendChild(pageButton);
            }

            const nextButton = createPageButton('Next', page + 1);
            paginationButtons.appendChild(nextButton);
        }

        // Show the song details section
        songDetails.style.display = 'block';

        // Update current page display
        setCurrentPageButton(page);
    }

    function createPageButton(label, pageNumber) {
        const pageButton = document.createElement('button');
        pageButton.classList.add('btn', 'btn-primary', 'mr-2');
        pageButton.textContent = label;
        pageButton.addEventListener('click', () => {
            displaySongs(pageNumber);
        });
        return pageButton;
    }

    function setCurrentPageButton(page) {
        const buttons = paginationButtons.querySelectorAll('.btn-primary');
        buttons.forEach(button => {
            if (button.textContent === page.toString()) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        });
    }

    function downloadSong(url, title, index) {
        // Hide the download button and show spinner
        const downloadButton = songsList.querySelectorAll('.btn-success')[index];
        const spinner = document.querySelector(`.spinner-${index}`);
        
        if (downloadButton) {
            downloadButton.style.display = 'none';
        }
        if (spinner) {
            spinner.style.display = 'block';
        }
    
        // Continue with fetch request if validation passes
        fetch('/download', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url, title }),
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
    
            // Handle the response to trigger the download process
            response.blob().then(blob => {
                const downloadUrl = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = downloadUrl;
                a.download = `${title}_spotifyinfo.com.mp3`; // Set the filename here
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(downloadUrl);
                if (spinner) {
                    spinner.style.display = 'none';
                }
                // Replace spinner with success message
                const successMessage = document.createElement('div');
                successMessage.textContent = 'Song downloaded successfully.';
                successMessage.classList.add('text-success');
                downloadButton.parentNode.appendChild(successMessage);
            });
        })
        .catch(error => {
            console.error('Error downloading song:', error);
            setStatusMessage('Error downloading song.', 'error');
            if (spinner) {
                spinner.style.display = 'none';
            }
            if (downloadButton) {
                downloadButton.style.display = 'block';
            }
        });
    }
    
    

    function setStatusMessage(message, type) {
        statusText.textContent = message;
        statusText.className = type; // 'error' or 'success' class
    }

    // Function to validate Spotify URL
    function isValidSpotifyUrl(inputUrl) {
        try {
            const url = new URL(inputUrl);
            return url.hostname === 'open.spotify.com';
        } catch (error) {
            return false;
        }
    }

    async function downloadAllSongs() {
        if (!allSongs || allSongs.length === 0) {
            setStatusMessage('No songs to download.', 'error');
            return;
        }

        const promises = allSongs.map((song, index) => {
            return new Promise((resolve, reject) => {
                downloadSong(song.url, song.title, index);
                setTimeout(resolve, 1000); // Simulate a delay for each download
                });
                });

                try {
                    await Promise.all(promises);
                    setStatusMessage(' ', 'success');
                } catch (error) {
                    console.error('Error downloading all songs:', error);
                    setStatusMessage('Error downloading all songs.', 'error');
                }
            }
        });
        // Event listener for search input
const searchInput = document.getElementById('searchSongs');
searchInput.addEventListener('input', function() {
    const searchTerm = this.value.trim().toLowerCase();

    // Filter songs based on search term
    const filteredSongs = allSongs.filter(song => {
        return song.title.toLowerCase().includes(searchTerm);
    });

    // Display filtered songs on the current page
    currentPage = 1;
    displaySongs(currentPage, filteredSongs);
});
