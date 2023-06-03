//authorization
const authorizationToken = prompt("Enter your password");

function authorizedFetch(url, options) {
	options = options || {};

	options.headers = {
		...options.headers,
		Authorization: authorizationToken
	};

	return fetch(url, options);
}

//player
const audioPlayer = document.getElementById('audio-player');
audioPlayer.addEventListener("timeupdate", setTimeline);

let currentSoundBufferBase64 = '';
let isPlaying = false; // for loading
let songCache = new Map();

//buttons
let paused = true;
let hasPauseButtonAlreadyBeenPressed = false;
const playImage = document.getElementById('play-image');
const pauseImage = document.getElementById('pause-image');

const shuffleImage = document.getElementById('shuffle-image');
const shuffleActiveImage = document.getElementById('shuffle-active-image');

let toggledShuffle = false;

let previousSongTimeout = false;
let currentSongIndex;

//currentsongInfo
const previewTitle = document.getElementById('preview-title');
const previewArtist = document.getElementById('preview-artist');
const previewCover = document.getElementById('preview-cover');
const timelineLength = document.getElementById('timeline-length');
const timelineCurrentTime = document.getElementById('timeline-currentTime');
let currentSongLength = 0;

//timeline
const timeline = document.getElementById('timeline');
const activeTimeline = document.getElementById('active-timeline');

//songList
const songListContainer = document.getElementById('songListContainer');
const searchFilter = document.getElementById('search-filter');
let songList = [];
let filteredSongList = [];
let shuffleSongList = [];
const sort = {
	type: 'index',
	direction: 'ASC'
};

//sort filters
const idFilter = document.getElementById('filters-id');
const titleFilter = document.getElementById('filters-title');
const artistFilter = document.getElementById('filters-artist');
const albumFilter = document.getElementById('filters-album');
const lengthFilter = document.getElementById('filters-length');

//fetchSongController
let fetchSongController;

loadSongList();

function setNewSource() {
	try {
		const binaryString = atob(currentSoundBufferBase64);
		const bytes = new Uint8Array(binaryString.length);
		for (let i = 0; i < binaryString.length; i++) {
			bytes[i] = binaryString.charCodeAt(i);
		}

		const blob = new Blob([bytes], {type: 'audio/mpeg'});
		const objectURL = URL.createObjectURL(blob);

		let tempTime = audioPlayer.currentTime | 0;

		audioPlayer.src = objectURL;
		audioPlayer.play();
		paused = false;
		pauseImage.style.display = 'inline-block';
		playImage.style.display = 'none';
		audioPlayer.currentTime = tempTime;
	} catch (error) {
		console.log(error);
		isPlaying = false;
		setTimeout(() => {
			setNewSource();
		}, 120);
	}
}

function playSong(id) {
	fetchSongController?.abort();
	fetchSongController = new AbortController();
	audioPlayer.pause();
	paused = true;
	playImage.style.display = 'inline-block';
	pauseImage.style.display = 'none';
	isPlaying = false;
	currentSoundBufferBase64 = '';
	audioPlayer.currentTime = 0;

	if (songCache.has(id) && songCache.get(id).title && songCache.get(id).base64Buffer) {
		const cachedSong = songCache.get(id);
		currentSoundBufferBase64 = cachedSong.base64Buffer;
		currentSongIndex = cachedSong.index;
		previewTitle.innerText = cachedSong.title;
		previewArtist.innerText = cachedSong.artist;
		previewCover.src = cachedSong.cover;
		timelineLength.innerText = secondsToTime(cachedSong.length);
		currentSongLength = cachedSong.length;
		newMediaSessionMetadata(cachedSong.title, cachedSong.artist, cachedSong.album);
		renderSongList();
		setNewSource();
	} else {
		authorizedFetch(`/songDetail/${id}`, {signal: fetchSongController?.signal}).then(response => {
			response.json().then(data => {
				currentSongIndex = data.Index;
				previewTitle.innerText = data.Title;
				previewArtist.innerText = data.Artist;
				previewCover.src = `data:image/png;base64,${data.ImageData || 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='}`;
				previewCover.style.display = 'block';
				timelineLength.innerText = secondsToTime(data.Length);
				currentSongLength = data.Length;
				newMediaSessionMetadata(data.Title, data.Artist, data.Album);

				const cachedSong = songCache.get(id)

				songCache.set(id, {
					index: data.Index,
					title: data.Title,
					artist: data.Artist,
					cover: `data:image/png;base64,${data.ImageData || 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='}`,
					length: data.Length,
					base64Buffer: cachedSong?.base64Buffer
				})
				renderSongList();
			}).catch(err => {
					console.log(err);
				}
			);
		});

		authorizedFetch(`/song/${id}`, {signal: fetchSongController?.signal}).then(response => {
			const reader = response.body.getReader();
			reader.read().then(function processResult(result) {
				currentSoundBufferBase64 += new TextDecoder().decode(result.value);
				if (result.done) {
					console.log('Stream complete');
					setNewSource();

					const cachedSong = songCache.get(id)

					songCache.set(id, {
						index: cachedSong?.index,
						title: cachedSong?.title,
						artist: cachedSong?.artist,
						cover: cachedSong?.cover,
						length: cachedSong?.length,
						base64Buffer: currentSoundBufferBase64
					});

					return;
				}

				if (currentSoundBufferBase64.length > 2100000 && !isPlaying) {
					setNewSource();
					isPlaying = true;
				}

				return reader.read().then(processResult);
			});
		}).catch(error => {
			console.error(error);
		});
	}
}

function setTimeline() {
	timelineCurrentTime.innerText = secondsToTime(Math.floor(audioPlayer.currentTime));
	activeTimeline.style.width = `${audioPlayer.currentTime / currentSongLength * 100}%`;
	if (Math.floor(audioPlayer.currentTime) === currentSongLength - 1) nextSong();
}

function loadSongList() {
	authorizedFetch(`/songs`)
		.then((response) => response.json())
		.then((data) => {
			songList = data;
			filteredSongList = songList;
			renderSongList();
		});
}

function renderSongList() {
	songListContainer.innerHTML = '';
	filteredSongList.forEach(song => {
		const html = `
          <div oncontextmenu="openContextMenuForSong(event, ${song.Index})" onclick="playSong(${song.Index})" class="eachSong ${song.Index == currentSongIndex ? 'active' : ''}">
            <p class="index">${song.Index}</p>
            <img src="data:image/png;base64,${song.ImageData || 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='}" alt="song">
            <p class="title">${song.Title}</p>
            <p class="artist">${song.Artist || 'Couln\'t fetch artist'}</p>
            <p class="album">${song.Album || 'Couln\'t fetch album'}</p>
            <p class="length">${secondsToTime(song.Length)}</p>
          </div>
        `;
		songListContainer.insertAdjacentHTML('beforeend', html);
	});
}

function secondsToTime(value) {
	const m = Math.floor(value / 60);
	const s = Math.round(value % 60);
	return `${m}:${s > 9 ? s : '0' + s}`;
}

function filterArray() {
	function arrayFilter(element) {
		const regExp = new RegExp(searchFilter.value, 'i');
		return regExp.test(element.Title) || regExp.test(element.Artist) || regExp.test(element.Album);
	}

	filteredSongList = songList.filter(arrayFilter);
	renderSongList();
}

function setSort(event, type) {
	idFilter.className = 'index';
	titleFilter.className = 'title';
	artistFilter.className = 'artist';
	albumFilter.className = 'album';
	lengthFilter.className = 'length';
	event.srcElement.className = event.srcElement.className + ' active';

	switch (type) {
		case 'index':
			sort.type = "index";
			if (sort.direction === "ASC") {
				songList.sort(function (a, b) {
					return b.Index - a.Index;
				});
				sort.direction = "DSC";
			} else {
				songList.sort(function (a, b) {
					return a.Index - b.Index;
				});
				sort.direction = "ASC";
			}
			break;
		case 'title':
			sort.type = "title";
			if (sort.direction === "ASC") {
				songList.sort(function (a, b) {
					if (a.Title < b.Title) {
						return -1;
					}
					if (a.Title > b.Title) {
						return 1;
					}
					return 0;
				});
				sort.direction = "DSC";
			} else {
				songList.sort(function (a, b) {
					if (a.Title > b.Title) {
						return -1;
					}
					if (a.Title < b.Title) {
						return 1;
					}
					return 0;
				});
				sort.direction = "ASC";
			}
			break;
		case 'artist':
			sort.type = "artist";
			if (sort.direction === "ASC") {
				songList.sort(function (a, b) {
					if (a.Artist < b.Artist) {
						return -1;
					}
					if (a.Artist > b.Artist) {
						return 1;
					}
					return 0;
				});
				sort.direction = "DSC";
			} else {
				songList.sort(function (a, b) {
					if (a.Artist > b.Artist) {
						return -1;
					}
					if (a.Artist < b.Artist) {
						return 1;
					}
					return 0;
				});
				sort.direction = "ASC";
			}
			break;
		case 'album':
			sort.type = "album";
			if (sort.direction === "ASC") {
				songList.sort(function (a, b) {
					if (a.Album < b.Album) {
						return -1;
					}
					if (a.Album > b.Album) {
						return 1;
					}
					return 0;
				});
				sort.direction = "DSC";
			} else {
				songList.sort(function (a, b) {
					if (a.Album > b.Album) {
						return -1;
					}
					if (a.Album < b.Album) {
						return 1;
					}
					return 0;
				});
				sort.direction = "ASC";
			}
			break;
		case 'length':
			sort.type = "length";
			if (sort.direction === "ASC") {
				songList.sort(function (a, b) {
					return b.Length - a.Length;
				});
				sort.direction = "DSC";
			} else {
				songList.sort(function (a, b) {
					return a.Length - b.Length;
				});
				sort.direction = "ASC";
			}
			break;
	}

	filterArray();
}

function setTime(event) {
	let clickedPortion = Math.round((event.pageX - (timeline.offsetLeft - timeline.offsetWidth / 2)) / timeline.offsetWidth * 100);
	audioPlayer.currentTime = currentSongLength * clickedPortion / 100;
}

function playButton() {
	if (paused) {
		audioPlayer.play().then(() => {
			paused = false;
			pauseImage.style.display = 'inline-block';
			playImage.style.display = 'none';
		});
	} else {
		audioPlayer.pause();
		paused = true;
		hasPauseButtonAlreadyBeenPressed = true;
		playImage.style.display = 'inline-block';
		pauseImage.style.display = 'none';
	}
}

function previousSong() {
	if (previousSongTimeout) {
		if (toggledShuffle) {
			playSong(shuffleSongList[shuffleSongList.indexOf(shuffleSongList.find(song => song.Index === currentSongIndex)) - 1].Index);
		} else {
			playSong(filteredSongList[filteredSongList.indexOf(filteredSongList.find(song => song.Index === currentSongIndex)) - 1].Index);
		}
	} else {
		audioPlayer.currentTime = 0;
		previousSongTimeout = true;
		setTimeout(() => {
			previousSongTimeout = false;
		}, 2000);
	}
}

function nextSong() {
	if (toggledShuffle) {
		playSong(shuffleSongList[shuffleSongList.indexOf(shuffleSongList.find(song => song.Index === currentSongIndex)) + 1].Index);
	} else {
		playSong(filteredSongList[filteredSongList.indexOf(filteredSongList.find(song => song.Index === currentSongIndex)) + 1].Index);
	}
}

function shuffle() {
	shuffleSongList = shuffleArray(JSON.parse(JSON.stringify(filteredSongList)));
	toggledShuffle = !toggledShuffle;

	if (toggledShuffle) {
		shuffleImage.style.display = 'none';
		shuffleActiveImage.style.display = 'inline-block';
	} else {
		shuffleImage.style.display = 'inline-block';
		shuffleActiveImage.style.display = 'none';
	}
}

function shuffleArray(array) {
	let currentIndex = array.length, randomIndex;

	while (currentIndex != 0) {
		randomIndex = Math.floor(Math.random() * currentIndex);
		currentIndex--;

		[array[currentIndex], array[randomIndex]] = [
			array[randomIndex], array[currentIndex]
		];
	}

	return array;
}

function setPreviewActive() {
	if (document.body.className === 'active') {
		document.body.className = '';
	} else {
		document.body.className = 'active';
	}
}

function newMediaSessionMetadata(title, artist, album) {
	// let test = prepareBase64DataAsFile(image, 'cover', 'image/png') nemazat
	// const imageUrl = URL.createObjectURL(test);
	navigator.mediaSession.metadata = new MediaMetadata({
		title: title,
		artist: artist,
		album: album
	});

	navigator.mediaSession.setActionHandler('previoustrack', previousSong);

	navigator.mediaSession.setActionHandler('nexttrack', nextSong);

	navigator.mediaSession.setActionHandler('play', playButton);

	navigator.mediaSession.setActionHandler('pause', playButton);
}

function changeShowedElements(event) {
	if (event.code === "KeyH" && event.shiftKey) {
		if (document.querySelector('footer').style.display !== 'none') {
			document.querySelector('footer').style.display = 'none';
		} else {
			document.querySelector('footer').style.display = 'block';
		}
	}

	if (event.code === "KeyT" && event.shiftKey) {
		if (previewTitle.style.display !== 'none') {
			previewTitle.style.display = 'none';
			previewArtist.style.display = 'none';
		} else {
			previewTitle.style.display = 'block';
			previewArtist.style.display = 'block';
		}
	}
}
