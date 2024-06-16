const express = require('express');
const bodyParser = require('body-parser');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const SpotifyWebApi = require('spotify-web-api-node');

const app = express();
const server = require('http').createServer(app);

// Ensure the downloads directory exists
const DOWNLOAD_FOLDER = path.join(__dirname, 'downloads');
if (!fs.existsSync(DOWNLOAD_FOLDER)) {
    fs.mkdirSync(DOWNLOAD_FOLDER);
}

app.use(bodyParser.json());
app.use(express.static('public'));

// Apply rate limiting to the download endpoint - 100 downloads per hour limit
const limiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour window
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again after an hour'
});

app.use('/download', limiter);

// Initialize Spotify API client
const spotifyApi = new SpotifyWebApi({
    clientId: '1940a333c2f84e5a982756ef48ea2786',
    clientSecret: '5f4024f921ec45579cdab10b397f5ad2',
});

// Get access token for Spotify API
spotifyApi.clientCredentialsGrant()
.then(data => {
    spotifyApi.setAccessToken(data.body.access_token);
})
.catch(error => {
    console.error('Error getting Spotify API access token:', error);
});

// Function to validate Spotify URL
function isValidSpotifyUrl(inputUrl) {
    try {
        const url = new URL(inputUrl);
        return url.hostname === 'open.spotify.com';
    } catch (error) {
        return false;
    }
}

// Function to fetch songs from Spotify based on the URL type (track, playlist, or album)
async function fetchSongsFromSpotify(url) {
    if (!isValidSpotifyUrl(url)) {
        throw new Error('Invalid Spotify URL');
    }

    const spotifyUrlParts = url.split('/');
    const type = spotifyUrlParts[3]; // 'track', 'playlist', or 'album'
    const id = spotifyUrlParts[4]; // Track, playlist, or album ID

    if (!type || !id) {
        throw new Error('Invalid Spotify URL format');
    }

    try {
        if (type === 'track') {
            const response = await spotifyApi.getTrack(id);
            const track = response.body;

            if (!track) {
                throw new Error('Track data not found for id ' + id);
            }

            const song = {
                title: track.name,
                thumbnail: track.album.images.length > 0 ? track.album.images[0].url : '',
                url: track.external_urls.spotify,
            };

            return [song]; // Return array with single song object
        } else if (type === 'playlist') {
            let songs = [];
            let offset = 0;
            const limit = 50; // Max limit for fetching tracks in a single request
            let totalTracks = 0;

            do {
                const response = await spotifyApi.getPlaylistTracks(id, { offset, limit });
                const items = response.body.items;

                totalTracks = response.body.total;
                offset += limit;

                items.forEach(item => {
                    const track = item.track;
                    if (!track) {
                        console.error('Track data not found for item:', item);
                        throw new Error('Track data not found for item ' + JSON.stringify(item));
                    }
                    const song = {
                        title: track.name,
                        thumbnail: track.album.images.length > 0 ? track.album.images[0].url : '',
                        url: track.external_urls.spotify,
                    };
                    songs.push(song);
                });

            } while (offset < totalTracks);

            return songs;
        } else if (type === 'album') {
            const response = await spotifyApi.getAlbum(id);
            const album = response.body
            if (!album) {
                throw new Error('Album data not found for id ' + id);
            }

            let songs = album.tracks.items.map(track => ({
                title: track.name,
                thumbnail: album.images.length > 0 ? album.images[0].url : '',
                url: track.external_urls.spotify,
            }));

            return songs;
        } else {
            throw new Error('Unsupported Spotify URL type');
        }
    } catch (error) {
        console.error('Error fetching songs from Spotify:', error);
        if (error.statusCode === 404) {
            throw new Error('Resource not found on Spotify');
        } else {
            throw new Error('Error communicating with Spotify API');
        }
    }
}

// Endpoint to fetch song details from Spotify including all songs in a playlist or album
app.get('/song-details', async (req, res) => {
    const { url } = req.query;

    if (!isValidSpotifyUrl(url)) {
        return res.status(400).json({ success: false, message: 'Please provide a valid Spotify URL.' });
    }

    try {
        const songs = await fetchSongsFromSpotify(url);

        if (!songs || songs.length === 0) {
            return res.status(404).json({ success: false, message: 'No songs found for the specified URL.' });
        }

        let contentType = '';
        if (url.includes('/track/')) {
            contentType = 'track';
        } else if (url.includes('/playlist/')) {
            contentType = 'playlist';
        } else if (url.includes('/album/')) {
            contentType = 'album';
        }

        res.json({ songs, contentType });
    } catch (error) {
        console.error('Error fetching songs from Spotify:', error);
        let errorMessage = 'Error fetching songs from Spotify.';
        if (error.message === 'Resource not found on Spotify') {
            errorMessage = 'The requested resource was not found on Spotify.';
        }
        res.status(500).json({ success: false, message: errorMessage });
    }
});

// Endpoint to download all songs at once
app.post('/download-all', async (req, res) => {
    const { urls } = req.body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
        return res.status(400).json({ success: false, message: 'Please provide valid song URLs.' });
    }

    try {
        const promises = urls.map(url => {
            // Construct the spotdl command array
            const outputFolder = DOWNLOAD_FOLDER;
            const command = `spotdl --output "${outputFolder}" ${url}`;

            return new Promise((resolve, reject) => {
                // Run spotdl command asynchronously
                const downloadProcess = exec(command);

                downloadProcess.stdout.on('data', (data) => {
                    console.log(`stdout: ${data}`);
                });

                downloadProcess.stderr.on('data', (data) => {
                    console.error(`stderr: ${data}`);
                    reject(new Error('Error downloading the song.'));
                });

                downloadProcess.on('close', (code) => {
                    if (code !== 0) {
                        console.error(`Download process exited with code ${code}`);
                        reject(new Error('Error downloading the song.'));
                    }

                    // Identify the downloaded file
                    const files = fs.readdirSync(outputFolder).filter(file => file.endsWith('.mp3'));
                    if (files.length === 0) {
                        reject(new Error('File not found.'));
                    }

                    const filePath = path.join(outputFolder, files[0]);
                    resolve(filePath);
                });
            });
        });

        // Wait for all downloads to complete
        Promise.all(promises)
            .then(filePaths => {
                // Compress downloaded files into a zip archive
                const zipFilePath = path.join(DOWNLOAD_FOLDER, 'all_songs.zip');
                const output = fs.createWriteStream(zipFilePath);
                const archive = archiver('zip');

                archive.pipe(output);
                filePaths.forEach(filePath => {
                    archive.file(filePath, { name: path.basename(filePath) });
                });

                archive.finalize();

                output.on('close', () => {
                    res.download(zipFilePath, 'all_songs.zip', (err) => {
                        if (err) {
                            console.error(`Error during file download: ${err}`);
                            return res.status(500).json({ success: false, message: 'Error downloading the songs.' });
                        }

                        // Optionally delete the zip file after sending it to the client
                        fs.unlink(zipFilePath, (unlinkErr) => {
                            if (unlinkErr) {
                                console.error(`Error deleting the file: ${unlinkErr}`);
                            }
                        });
                    });
                });
            })
            .catch(error => {
                console.error('Error downloading all songs:', error);
                res.status(500).json({ success: false, message: 'Error downloading the songs.' });
            });
    } catch (error) {
        console.error('Error downloading all songs:', error);
        res.status(500).json({ success: false, message: 'Error downloading the songs.' });
    }
});


// Endpoint to download songs
app.post('/download', (req, res) => {
    const url = req.body.url;

    if (!isValidSpotifyUrl(url)) {
        return res.status(400).json({ success: false, message: 'Please provide a valid Spotify URL.' });
    }

    // Construct the spotdl command array
    const outputFolder = DOWNLOAD_FOLDER;
    const command = `spotdl --output "${outputFolder}" ${url}`;

    // Run spotdl command asynchronously
    const downloadProcess = exec(command);

    downloadProcess.stdout.on('data', (data) => {
        console.log(`stdout: ${data}`);
    });

    downloadProcess.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`);
    });

    downloadProcess.on('close', (code) => {
        if (code !== 0) {
            console.error(`Download process exited with code ${code}`);
            return res.status(500).json({ success: false, message: 'Error downloading the song.' });
        }

        // Identify the downloaded file
        const files = fs.readdirSync(outputFolder).filter(file => file.endsWith('.mp3'));
        if (files.length === 0) {
            return res.status(404).json({ success: false, message: 'File not found.' });
        }

        const filePath = path.join(outputFolder, files[0]);

        // Stream the file to the client
        res.download(filePath, `${path.basename(filePath)}`, (err) => {
            if (err) {
                console.error(`Error during file download: ${err}`);
                return res.status(500).json({ success: false, message: 'Error downloading the song.' });
            }

            // Optionally delete the file after sending it to the client
            fs.unlink(filePath, (unlinkErr) => {
                if (unlinkErr) {
                    console.error(`Error deleting the file: ${unlinkErr}`);
                }
            });
        });
    });
});

// Endpoint to fetch playlist or album name
app.get('/playlist-album-name', async (req, res) => {
    const { type, id } = req.query;

    try {
        let name = '';

        if (type === 'playlist') {
            const response = await spotifyApi.getPlaylist(id);
            name = response.body.name;
        } else if (type === 'album') {
            const response = await spotifyApi.getAlbum(id);
            name = response.body.name;
        } else {
            throw new Error('Unsupported Spotify URL type');
        }

        res.json({ name });
    } catch (error) {
        console.error('Error fetching playlist/album name:', error);
        res.status(500).json({ success: false, message: 'Error fetching playlist/album name.' });
    }
});

// Middleware for persistent storage and management (Security and Performance)
app.use((req, res, next) => {
    // Implement any security measures here (e.g., headers, logging)
    // This middleware could be used for logging, security headers, etc.
    next();
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
