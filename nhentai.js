/** @type {import('./_venera_.js')} */
class NhentaiCustom extends ComicSource {
    // name of the source
    name = "nhentai"

    // unique id of the source
    key = "nhentai_custom"

    version = "1.0.0"

    minAppVersion = "1.4.0"

    // update url
    url = "https://cdn.jsdelivr.net/gh/akafive/venera-comic-sources@main/nhentai.js"

    baseUrl = "https://nhentai.net"
    apiBaseUrl = "https://nhentai.net/api/v2"
    imageServer = "https://i3.nhentai.net"
    thumbServer = "https://t3.nhentai.net"

    account = {
        loginWithWebview: {
            url: "https://nhentai.net/login/?next=/",
            checkStatus: (url, title) => {
                return url === "https://nhentai.net/"
            },
        },

        logout: () => {
            Network.deleteCookies("https://nhentai.net")
        },

        registerWebsite: "https://nhentai.net/register/"
    }

    normalizeId(id) {
        id = String(id || "")
        if (id.startsWith("nhentai")) {
            return id.replace("nhentai", "")
        }
        if (id.startsWith("nh")) {
            return id.replace("nh", "")
        }
        return id
    }

    imageHeaders() {
        return {
            Referer: "https://nhentai.net/",
            "User-Agent": "Mozilla/5.0"
        }
    }

    mediaUrl(path, isThumb = false) {
        if (!path) {
            return ""
        }
        if (typeof path === "object") {
            path = path.path || path.url || ""
        }
        path = String(path || "")
        if (!path) {
            return ""
        }

        if (path.startsWith("http")) {
            return path
        }
        if (path.startsWith("//")) {
            return "https:" + path
        }
        if (path.startsWith("/")) {
            path = path.slice(1)
        }

        return `${isThumb ? this.thumbServer : this.imageServer}/${path}`
    }

    parseLanguage(tagIds = []) {
        if (tagIds.includes(12227)) {
            return "English"
        }
        if (tagIds.includes(6346)) {
            return "日本語"
        }
        if (tagIds.includes(29963)) {
            return "中文"
        }
        return "Unknown"
    }

    parseHtmlComic(element) {
        let imgEl = element.querySelector("a > img")
        let img = imgEl?.attributes?.["data-src"] || imgEl?.attributes?.["src"] || ""
        let name = element.querySelector("div.caption")?.text || ""
        let href = element.querySelector("a")?.attributes?.["href"] || ""
        let idMatch = href.match(/\d+/g)
        let id = idMatch ? idMatch.join("") : ""
        let dataTags = element?.attributes?.["data-tags"] || ""
        let tagIds = dataTags.split(" ").map((v) => Number(v)).filter((v) => !Number.isNaN(v))

        return new Comic({
            id: id,
            title: name,
            subtitle: "",
            cover: this.mediaUrl(img, true),
            tags: [],
            description: id,
            language: this.parseLanguage(tagIds),
        })
    }

    parseApiComic(item) {
        return new Comic({
            id: String(item.id),
            title: item.english_title || item.japanese_title || String(item.id),
            subtitle: "",
            cover: this.mediaUrl(item.thumbnail || item.cover || "", true),
            tags: [],
            description: String(item.id),
            language: this.parseLanguage(item.tag_ids || []),
        })
    }

    parseApiComicList(data) {
        return {
            comics: (data.result || []).map((e) => this.parseApiComic(e)),
            maxPage: data.num_pages || 1,
        }
    }

    formatTime(timestampSec) {
        let time = new Date(Number(timestampSec) * 1000)
        if (Number.isNaN(time.getTime())) {
            return ""
        }
        const year = time.getFullYear()
        const month = time.getMonth() + 1
        const day = time.getDate()
        const hour = time.getHours()
        const minute = time.getMinutes()
        return `${year}-${month}-${day} ${hour}:${minute}`
    }

    tagNamespace(tagType) {
        switch ((tagType || "").toLowerCase()) {
            case "language":
                return "Languages"
            case "artist":
                return "Artists"
            case "character":
                return "Characters"
            case "group":
                return "Groups"
            case "parody":
                return "Parodies"
            case "category":
                return "Categories"
            case "tag":
                return "Tags"
            default:
                return "Tags"
        }
    }

    buildTags(tags = []) {
        let result = new Map()
        for (let tag of tags) {
            let ns = this.tagNamespace(tag.type)
            if (!result.has(ns)) {
                result.set(ns, [])
            }
            result.get(ns).push(tag.name)
        }
        return result
    }

    pageTypeToExt(type) {
        switch (String(type || "").toLowerCase()) {
            case "p":
            case "png":
                return "png"
            case "g":
            case "gif":
                return "gif"
            case "w":
            case "webp":
                return "webp"
            case "j":
            case "jpg":
            case "jpeg":
            default:
                return "jpg"
        }
    }

    extractApiImages(data) {
        let pages = []
        if (Array.isArray(data?.pages)) {
            pages = data.pages
        } else if (Array.isArray(data?.images?.pages)) {
            pages = data.images.pages
        }

        let direct = pages
            .map((p) => p?.path || p?.image?.path || p?.url || "")
            .map((p) => this.mediaUrl(p, false))
            .filter(Boolean)

        if (direct.length > 0) {
            return direct
        }

        let mediaId = String(data?.media_id || data?.mediaId || "")
        let typedPages = data?.images?.pages || []
        if (mediaId && typedPages.length > 0) {
            return typedPages.map((page, index) => {
                let ext = this.pageTypeToExt(page?.t || page?.type || page?.extension)
                return `${this.imageServer}/galleries/${mediaId}/${index + 1}.${ext}`
            })
        }

        return []
    }

    // explore page list
    explore = [
        {
            title: "nhentai",
            type: "multiPageComicList",
            load: async (page) => {
                page = page || 1
                let url = page === 1 ? this.baseUrl : `${this.baseUrl}/?page=${page}`
                let res = await Network.get(url, {})
                if (res.status !== 200) {
                    throw "Invalid Status Code: " + res.status
                }
                let document = new HtmlDocument(res.body)
                let comics = document.querySelectorAll("div.gallery").map((e) => this.parseHtmlComic(e))
                return {
                    comics,
                    maxPage: 20000,
                }
            }
        }
    ]

    // search related
    search = {
        load: async (keyword, options, page) => {
            let sort = options[0] || "date"
            let url = `${this.apiBaseUrl}/search?query=${encodeURIComponent(keyword)}&page=${page}&sort=${sort}`
            let res = await Network.get(url, {})
            if (res.status !== 200) {
                throw "Invalid Status Code: " + res.status
            }
            return this.parseApiComicList(JSON.parse(res.body))
        },

        optionList: [
            {
                options: [
                    "date-Recent",
                    "popular-today-Popular Today",
                    "popular-week-Popular Week",
                    "popular-month-Popular Month",
                    "popular-Popular All",
                ],
                label: "sort"
            }
        ],

        enableTagsSuggestions: false,
    }

    // single comic related
    comic = {
        onThumbnailLoad: (url) => {
            return {
                headers: this.imageHeaders(),
            }
        },

        onImageLoad: (url) => {
            return {
                headers: this.imageHeaders(),
            }
        },

        loadInfo: async (id) => {
            id = this.normalizeId(id)

            let apiRes = await Network.get(`${this.apiBaseUrl}/galleries/${id}?include=related,pages`, {})
            if (apiRes.status === 200) {
                let data = JSON.parse(apiRes.body)

                let title = data?.title?.pretty || data?.title?.english || String(id)
                let englishTitle = data?.title?.english || ""
                let subtitle = englishTitle && englishTitle !== title ? englishTitle : ""
                let cover = this.mediaUrl(data?.cover?.path || data?.thumbnail?.path || data?.thumbnail || "", true)

                let thumbnails = (data.pages || [])
                    .map((p) => this.mediaUrl(p.thumbnail || p.thumbnail?.path || p.thumb || "", true))
                    .filter(Boolean)

                let related = (data.related || []).map((e) => this.parseApiComic(e))

                return new ComicDetails({
                    id: String(id),
                    title: title || String(id),
                    subtitle: subtitle || "",
                    cover: cover || "",
                    tags: this.buildTags(data.tags || []),
                    uploadTime: this.formatTime(data?.upload_date),
                    isFavorite: !!data?.is_favorited,
                    thumbnails: thumbnails,
                    related: related,
                    url: `${this.baseUrl}/g/${id}/`,
                })
            }

            let res = await Network.get(`${this.baseUrl}/g/${id}/`, {})
            if (res.status !== 200) {
                throw "Invalid Status Code: " + res.status
            }

            let document = new HtmlDocument(res.body)
            let coverEl = document.querySelector("div#cover > a > img")
            let cover = coverEl?.attributes?.["data-src"] || coverEl?.attributes?.["src"] || ""
            let mainTitle = document.querySelector("h1.title")?.text || ""
            let secondaryTitle = document.querySelector("h2.title")?.text || ""
            let title = secondaryTitle || mainTitle || String(id)
            let subtitle = mainTitle && mainTitle !== title ? mainTitle : ""

            let tags = new Map()
            for (let field of document.querySelectorAll("div.tag-container")) {
                let name = field.nodes[0].text.trim().replaceAll(":", "")
                if (name === "Uploaded") {
                    continue
                }
                let values = field.querySelectorAll("span.name").map((e) => e.text)
                if (values.length > 0) {
                    tags.set(name, values)
                }
            }

            let thumbs = document.querySelectorAll("a.gallerythumb > img")
                .map((e) => e.attributes?.["data-src"] || e.attributes?.["src"] || "")
                .filter(Boolean)

            let related = document.querySelectorAll("div.gallery").map((e) => this.parseHtmlComic(e))

            return new ComicDetails({
                id: String(id),
                title: title || String(id),
                subtitle: subtitle || "",
                cover: cover || "",
                tags: tags,
                thumbnails: thumbs,
                related: related,
                url: `${this.baseUrl}/g/${id}/`,
            })
        },

        loadEp: async (comicId, epId) => {
            comicId = this.normalizeId(comicId)

            let apiUrls = [
                `${this.apiBaseUrl}/galleries/${comicId}?include=pages`,
                `${this.apiBaseUrl}/galleries/${comicId}`,
                `${this.apiBaseUrl}/galleries/${comicId}/pages`,
            ]

            for (let url of apiUrls) {
                let apiRes = await Network.get(url, {})
                if (apiRes.status !== 200) {
                    continue
                }
                let apiData = JSON.parse(apiRes.body)
                let images = this.extractApiImages(apiData)
                if (images.length > 0) {
                    return { images: images }
                }
            }

            throw "Failed to load gallery pages"
        },

        idMatch: "^(\\d+|nh\\d+|nhentai\\d+)$",

        onClickTag: (namespace, tag) => {
            return {
                action: "search",
                keyword: tag,
            }
        },

        link: {
            domains: [
                "nhentai.net",
            ],
            linkToId: (url) => {
                let match = String(url || "").match(/\/g\/(\d+)\/?$/)
                if (match) {
                    return match[1]
                }
                return null
            }
        },

        enableTagsTranslate: false,
    }

    translation = {
        zh_CN: {
            Recent: "最近",
            "Popular Today": "今日热门",
            "Popular Week": "本周热门",
            "Popular Month": "本月热门",
            "Popular All": "总热门",
            sort: "排序",
            Languages: "语言",
            Artists: "画师",
            Characters: "角色",
            Groups: "团队",
            Parodies: "原作",
            Categories: "分类",
            Tags: "标签",
        },
        zh_TW: {
            Recent: "最近",
            "Popular Today": "今日熱門",
            "Popular Week": "本週熱門",
            "Popular Month": "本月熱門",
            "Popular All": "總熱門",
            sort: "排序",
            Languages: "語言",
            Artists: "畫師",
            Characters: "角色",
            Groups: "團隊",
            Parodies: "原作",
            Categories: "分類",
            Tags: "標籤",
        },
        en: {},
    }
}
