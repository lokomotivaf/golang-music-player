package main

import (
	"bytes"
	"encoding/base64"
	"github.com/bogem/id3v2"
	"github.com/disintegration/imaging"
	"github.com/hajimehoshi/go-mp3"
	"image"
	"image/jpeg"
	"os"
)

func getImageFromId3v2Tag(tag *id3v2.Tag) []byte {
	frames := tag.GetFrames(tag.CommonID("Attached picture"))
	var pic []byte

	for _, f := range frames {
		tempPic, ok := f.(id3v2.PictureFrame)
		if !ok {
			return nil
		}

		pic = tempPic.Picture
	}

	return pic
}

func getSmallImageFromId3v2Tag(tag *id3v2.Tag) []byte {
	thumbnail, _, err := image.Decode(bytes.NewReader(getImageFromId3v2Tag(tag)))
	if err != nil {
		return nil
	}

	thumbnail = imaging.Resize(thumbnail, 40, 0, imaging.Lanczos)

	var buf bytes.Buffer
	err = jpeg.Encode(&buf, thumbnail, nil)
	if err != nil {
		return nil
	}

	return buf.Bytes()
}

func buildSongDetail(id int, filePath string, playlistLength int) (*SongDetail, error) {
	file, err := os.Open(filePath)
	tag, err := id3v2.Open(filePath, id3v2.Options{Parse: true})
	decodedStream, err := mp3.NewDecoder(file)
	if err != nil {
		return nil, err
	}

	return &SongDetail{
		Index:          id,
		Title:          tag.Title(),
		Artist:         tag.Artist(),
		Length:         int(float64(decodedStream.Length())/4) / decodedStream.SampleRate(),
		ImageData:      base64.StdEncoding.EncodeToString(getImageFromId3v2Tag(tag)),
		PlaylistLength: playlistLength,
	}, nil
}

func buildSongListEntry(id int, filePath string) (*SongDetail, error) {
	file, err := os.Open(filePath)
	tag, err := id3v2.Open(filePath, id3v2.Options{Parse: true})
	decodedStream, err := mp3.NewDecoder(file)
	if err != nil {
		return nil, err
	}

	return &SongDetail{
		Index:     id,
		Title:     tag.Title(),
		Artist:    tag.Artist(),
		Album:     tag.Album(),
		Length:    int(float64(decodedStream.Length())/4) / decodedStream.SampleRate(),
		ImageData: base64.StdEncoding.EncodeToString(getSmallImageFromId3v2Tag(tag)),
	}, nil
}

func getNameArrayFromDirEntry(entry []os.DirEntry) []string {
	var result []string

	for _, item := range entry {
		result = append(result, item.Name())
	}

	return result
}

func arraysHaveSameEntries[E comparable](a1 []E, a2 []E) bool {
	result := true

	if a1 == nil && a2 == nil {
		return result
	}

	for _, e := range a1 {
		if !contains(a2, e) {
			result = false
		}
	}

	for _, e2 := range a2 {
		if !contains(a1, e2) {
			result = false
		}
	}

	return result
}

func contains[E comparable](s []E, v E) bool {
	return index(s, v) >= 0
}

func index[E comparable](s []E, v E) int {
	for i, vs := range s {
		if v == vs {
			return i
		}
	}
	return -1
}
