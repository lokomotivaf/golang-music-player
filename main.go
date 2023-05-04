package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"

	"github.com/gorilla/mux"
)

type SongDetail struct {
	Index          int    `json:"Index"`
	Title          string `json:"Title"`
	Artist         string `json:"Artist"`
	Album          string `json:"Album"`
	Length         int    `json:"Length"`
	ImageData      string `json:"ImageData"`
	PlaylistLength int    `json:"PlaylistLength"`
}

var PORT = 5420
var DIRECTORY = "music"
var FILES, _ = os.ReadDir(DIRECTORY)
var AUTHPASSWORD = "Super-tezke-heslo"

func main() {
	router := mux.NewRouter()

	router.HandleFunc("/songDetail/{id}", authMiddleware(songDetailHandler())).Methods("GET")
	router.HandleFunc("/song/{id}", authMiddleware(songHandler())).Methods("GET")
	router.HandleFunc("/songs", authMiddleware(songListHandler())).Methods("GET")
	router.PathPrefix("/static/").Handler(http.StripPrefix("/static/", http.FileServer(http.Dir("static"))))

	http.ListenAndServe(fmt.Sprintf(":%d", PORT), router)
}
func songDetailHandler() http.HandlerFunc {
	return func(response http.ResponseWriter, request *http.Request) {
		fmt.Println(">>>GET /songDetail/" + mux.Vars(request)["id"])
		response.Header().Set("Content-Type", "application/json")

		id, err := isValidId(mux.Vars(request)["id"])
		if err != nil {
			http.Error(response, "Invalid song id", http.StatusBadRequest)
			return
		}

		filePath := fmt.Sprintf("%s/%s", DIRECTORY, FILES[id].Name())

		songDetail, err := buildSongDetail(id, filePath, len(FILES))
		if err != nil {
			http.Error(response, "Failed to extract metadata from song file", http.StatusInternalServerError)
			return
		}

		json.NewEncoder(response).Encode(songDetail)
	}
}

func songHandler() http.HandlerFunc {
	return func(response http.ResponseWriter, request *http.Request) {
		fmt.Println(">>>GET /song/" + mux.Vars(request)["id"])
		response.Header().Set("Content-Type", "text/octet-stream")

		id, err := isValidId(mux.Vars(request)["id"])
		if err != nil {
			http.Error(response, "Invalid song id", http.StatusBadRequest)
			return
		}

		file, _ := os.ReadFile(fmt.Sprintf("%s/%s", DIRECTORY, FILES[id].Name()))
		base64data := base64.StdEncoding.EncodeToString(file)

		flusher, ok := response.(http.Flusher)
		if !ok {
			http.Error(response, "Streaming unsupported!", http.StatusInternalServerError)
			return
		}

		for i := 0; i < 100; i++ {
			fmt.Printf("\rLoaded %d%% of song", (len(base64data)*(i+1))/len(base64data))
			data := base64data[len(base64data)/100*i : len(base64data)/100*(i+1)]
			response.Write([]byte(data))
			flusher.Flush()
		}

		fmt.Print("\n")
	}
}

func songListHandler() http.HandlerFunc {
	return func(response http.ResponseWriter, _ *http.Request) {
		fmt.Println(">>>GET /songlist")
		response.Header().Set("Content-Type", "application/json")

		hardReload := false
		checkNameArray := make([]string, 0)
		currentNameArray := getNameArrayFromDirEntry(FILES)

		allMusicJsonData, err := os.ReadFile("AllMusic.json")
		if err != nil {
			hardReload = true
		}

		checkArrayData, err := os.ReadFile("AllMusicDirectoryCheck.txt")
		if err != nil {
			hardReload = true
		}

		err = json.Unmarshal(checkArrayData, &checkNameArray)
		if err != nil {
			hardReload = true
		}

		if !arraysHaveSameEntries(currentNameArray, checkNameArray) {
			hardReload = true
		}

		if hardReload {
			var songList []SongDetail
			fmt.Println("Hard music reload")

			for i, file := range FILES {
				song, err := buildSongListEntry(i, fmt.Sprintf("%s/%s", DIRECTORY, file.Name()))
				if err != nil {
					fmt.Printf("Error opening file: %s \n", file.Name())
					continue
				}

				fmt.Printf("\rSong number %d / %d loaded", i+1, len(FILES))
				songList = append(songList, *song)
			}
			fmt.Print("\n")

			file, _ := json.MarshalIndent(songList, "", " ")
			_ = os.WriteFile("AllMusic.json", file, 0644)
			checkFile, _ := json.MarshalIndent(getNameArrayFromDirEntry(FILES), "", " ")
			_ = os.WriteFile("AllMusicDirectoryCheck.txt", checkFile, 0644)

			json.NewEncoder(response).Encode(songList)
		} else {
			fmt.Println("Loading AllMusic.json")

			response.Write(allMusicJsonData)
		}
	}
}

func isValidId(idString string) (int, error) {
	id, err := strconv.Atoi(idString)
	if err != nil {
		return 0, err
	}

	if id < 0 || id > (len(FILES)-1) {
		return 0, fmt.Errorf("id out of range")
	}

	return id, nil
}

func authMiddleware(next http.Handler) http.HandlerFunc {
	return func(response http.ResponseWriter, request *http.Request) {
		providedPassword := request.Header.Get("Authorization")

		if providedPassword != AUTHPASSWORD {
			http.Error(response, "Unauthorized", http.StatusUnauthorized)
			return
		}

		next.ServeHTTP(response, request)
	}
}
