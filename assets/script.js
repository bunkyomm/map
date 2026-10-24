// 文京区「あなたの名所ものがたり」地図
// ピン・ポップアップ・クラスターの作法は ./ref/script.js の構成を踏襲している。

(function () {
    const defaultCenter = [35.718, 139.745]; // 文京区付近（データ取得前の仮表示）
    const defaultZoom = 14;

    const map = L.map('map', { zoomControl: false }).setView(defaultCenter, defaultZoom);

    // --- ベースタイル：デフォルトは OpenStreetMap ---
    const osmTile = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);
    const gsiStd = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', {
        attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">国土地理院</a>',
        maxZoom: 18
    });
    const photoTile = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg', {
        attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">国土地理院</a>',
        maxZoom: 18
    });
    L.control.layers({
        'OpenStreetMap': osmTile,
        '地理院標準地図': gsiStd,
        '航空写真': photoTile
    }, null, { position: 'bottomright' }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.control.scale({ position: 'bottomleft', imperial: false }).addTo(map);

    function escapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function escapeAttr(str) {
        return escapeHtml(str);
    }

    function nl2br(escaped) {
        return escaped.replace(/\n/g, '<br>');
    }

    // --- ピン SVG ---
    function getPinSvg(color, w, h) {
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 42" width="' + w + '" height="' + h + '">'
            + '<path d="M15 0C6.7 0 0 6.7 0 15c0 10 15 27 15 27S30 25 30 15C30 6.7 23.3 0 15 0z" fill="' + color + '"/>'
            + '<circle cx="15" cy="15" r="5" fill="#fff"/>'
            + '</svg>';
    }

    function createMarkerIcon(color) {
        return L.divIcon({
            className: 'custom-pin',
            html: '<div class="pin-svg">' + getPinSvg(color, 28, 40) + '</div>',
            iconSize: [28, 40],
            iconAnchor: [14, 40],
            popupAnchor: [0, -42]
        });
    }

    // --- クラスターピン ---
    function getClusterPinSvg(color, w, h) {
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 42" width="' + w + '" height="' + h + '">'
            + '<path d="M15 0C6.7 0 0 6.7 0 15c0 10 15 27 15 27S30 25 30 15C30 6.7 23.3 0 15 0z" fill="' + color + '"/>'
            + '</svg>';
    }

    const clusterGroup = L.markerClusterGroup({
        maxClusterRadius: 60,
        showCoverageOnHover: false,
        spiderfyOnMaxZoom: true,
        iconCreateFunction: function (cluster) {
            const count = cluster.getChildCount();
            let cls, color, inner = [28, 40], outer = [35, 50];
            if (count < 5) {
                cls = 'cluster-small'; color = 'rgba(46, 204, 113, 0.9)';
            } else if (count < 15) {
                cls = 'cluster-medium'; color = 'rgba(243, 156, 18, 0.9)';
                inner = [34, 48]; outer = [42, 60];
            } else {
                cls = 'cluster-large'; color = 'rgba(192, 57, 43, 0.92)';
                inner = [40, 56]; outer = [50, 70];
            }
            const outerColor = color.replace(/[\d.]+\)$/, '0.3)');
            const html = '<div class="cluster-pin-container ' + cls + '">'
                + '<div class="cluster-pin-outer">' + getClusterPinSvg(outerColor, outer[0], outer[1]) + '</div>'
                + '<div class="cluster-pin-inner">' + getClusterPinSvg(color, inner[0], inner[1]) + '</div>'
                + '<div class="cluster-pin-count-wrap"><span class="cluster-pin-count">' + count + '</span></div>'
                + '</div>';
            return L.divIcon({ html: html, className: 'cluster-pin-icon-wrap', iconSize: outer, iconAnchor: [outer[0] / 2, outer[1]] });
        }
    });
    map.addLayer(clusterGroup);

    // --- 画像拡大モーダル ---
    const $modal = document.getElementById('image-modal');
    const $modalImg = document.getElementById('enlarged-image');
    window.openImageModal = function (url) {
        $modalImg.src = url;
        $modal.classList.remove('hidden');
    };
    function closeImageModal() {
        $modal.classList.add('hidden');
        $modalImg.src = '';
    }
    document.getElementById('image-modal-close').addEventListener('click', closeImageModal);
    $modal.addEventListener('click', function (e) { if (e.target === $modal) closeImageModal(); });

    // --- データ読み込み ---
    fetch('./spots.json')
        .then(function (res) { return res.json(); })
        .then(initMap)
        .catch(function (err) {
            console.error('spots.json の読み込みに失敗しました', err);
            alert('データの読み込みに失敗しました。ページを再読み込みしてください。');
        });

    function buildThemeColorMap(spots) {
        const themes = Array.from(new Set(spots.map(function (s) { return s.theme; }))).sort();
        const map = {};
        themes.forEach(function (theme, i) {
            const hue = Math.round((i * 360) / themes.length);
            map[theme] = 'hsl(' + hue + ', 62%, 45%)';
        });
        return map;
    }

    function groupByCoord(spots) {
        // 座標が実質同一（小数点5桁 ≒ 1m以内）のスポットを1つのマーカーにまとめる
        const groups = {};
        spots.forEach(function (s) {
            const key = s.lat.toFixed(5) + ',' + s.lng.toFixed(5);
            if (!groups[key]) groups[key] = [];
            groups[key].push(s);
        });
        return Object.keys(groups).map(function (key) {
            const list = groups[key];
            return { lat: list[0].lat, lng: list[0].lng, stories: list };
        });
    }

    function buildStoryHtml(spot, themeColorMap) {
        const themeColor = themeColorMap[spot.theme] || '#808080';
        let html = '<div class="popup-story">';
        html += '<div class="popup-tag-row">'
            + '<span class="popup-tag popup-tag-year">' + escapeHtml(spot.year || '') + '年度</span>'
            + '<span class="popup-tag" style="background:' + themeColor + '">' + escapeHtml(spot.theme) + '</span>'
            + '</div>';
        html += '<h3 class="popup-title">' + escapeHtml(spot.title) + '</h3>';
        html += '<p class="popup-meta">📍 ' + escapeHtml(spot.place) + (spot.author ? '　✍ ' + escapeHtml(spot.author) : '') + '</p>';

        if (spot.images && spot.images.length > 0) {
            html += '<div class="popup-gallery">';
            spot.images.forEach(function (src, i) {
                html += '<img src="' + escapeAttr(src) + '" class="popup-image" alt="' + escapeAttr(spot.title) + 'の写真' + (i + 1) + '"'
                    + ' onclick="openImageModal(\'' + escapeAttr(src) + '\')"'
                    + ' onerror="this.style.display=\'none\'">';
            });
            html += '</div>';
        }

        if (spot.body) {
            html += '<div class="popup-desc">' + nl2br(escapeHtml(spot.body)) + '</div>';
        }

        if (spot.audio) {
            html += '<audio class="popup-audio" controls preload="none" src="' + escapeAttr(spot.audio) + '"></audio>';
        }

        html += '</div>';
        return html;
    }

    function buildPopupHtml(group, themeColorMap) {
        let html = '<div class="popup-content">';
        if (group.stories.length > 1) {
            html += '<p class="popup-group-label">この場所には' + group.stories.length + '件のものがたりがあります</p>';
        }
        group.stories.forEach(function (spot) {
            html += buildStoryHtml(spot, themeColorMap);
        });
        html += '</div>';
        return html;
    }

    function truncate(str, n) {
        const clean = String(str || '').replace(/\s+/g, ' ').trim();
        return clean.length > n ? clean.slice(0, n) + '…' : clean;
    }

    function initMap(spots) {
        const themeColorMap = buildThemeColorMap(spots);
        const years = Array.from(new Set(spots.map(function (s) { return s.year; }))).sort();
        const themes = Object.keys(themeColorMap).sort();

        const activeYears = new Set(years);
        const activeThemes = new Set(themes);

        const groups = groupByCoord(spots);
        const spotIdToEntry = {};
        const markerEntries = groups.map(function (group) {
            // マーカー表示色：グループ内で最も新しい年度のテーマ色を使う
            const repTheme = group.stories[group.stories.length - 1].theme;
            const marker = L.marker([group.lat, group.lng], { icon: createMarkerIcon(themeColorMap[repTheme]) });
            marker.bindPopup(buildPopupHtml(group, themeColorMap), {
                maxWidth: 560,
                minWidth: 260,
                autoPanPadding: [10, 10]
            });
            const entry = { marker: marker, group: group };
            group.stories.forEach(function (s) { spotIdToEntry[s.id] = entry; });
            return entry;
        });

        const $dataList = document.getElementById('data-list');
        const $count = document.getElementById('count');
        let activeListItemId = null;

        function renderDataList(visibleSpots) {
            if (visibleSpots.length === 0) {
                $dataList.innerHTML = '<p class="list-item-empty">該当するものがたりがありません</p>';
                return;
            }
            const html = visibleSpots.map(function (spot) {
                const themeColor = themeColorMap[spot.theme] || '#808080';
                const activeCls = spot.id === activeListItemId ? ' active' : '';
                return '<div class="list-item' + activeCls + '" data-id="' + spot.id + '">'
                    + '<h3>' + escapeHtml(spot.title) + '</h3>'
                    + '<div class="badges">'
                    + '<span class="badge badge-year">' + escapeHtml(spot.year || '') + '年度</span>'
                    + '<span class="badge" style="background:' + themeColor + '">' + escapeHtml(spot.theme) + '</span>'
                    + '</div>'
                    + '<p class="snippet">' + escapeHtml(truncate(spot.body, 70)) + '</p>'
                    + '</div>';
            }).join('');
            $dataList.innerHTML = html;
        }

        function navigateToSpot(spotId) {
            const entry = spotIdToEntry[spotId];
            if (!entry) return;
            activeListItemId = spotId;
            $dataList.querySelectorAll('.list-item').forEach(function (el) {
                el.classList.toggle('active', el.getAttribute('data-id') === String(spotId));
            });
            clusterGroup.zoomToShowLayer(entry.marker, function () {
                entry.marker.openPopup();
            });
        }

        $dataList.addEventListener('click', function (e) {
            const item = e.target.closest('.list-item');
            if (item) navigateToSpot(parseInt(item.getAttribute('data-id'), 10));
        });

        function applyFilter() {
            clusterGroup.clearLayers();
            const visibleSpots = [];
            markerEntries.forEach(function (entry) {
                const visibleStories = entry.group.stories.filter(function (s) {
                    return activeYears.has(s.year) && activeThemes.has(s.theme);
                });
                if (visibleStories.length > 0) {
                    if (visibleStories.length !== entry.group.stories.length) {
                        entry.marker.setPopupContent(buildPopupHtml({ lat: entry.group.lat, lng: entry.group.lng, stories: visibleStories }, themeColorMap));
                    } else {
                        entry.marker.setPopupContent(buildPopupHtml(entry.group, themeColorMap));
                    }
                    clusterGroup.addLayer(entry.marker);
                    visibleSpots.push.apply(visibleSpots, visibleStories);
                }
            });
            visibleSpots.sort(function (a, b) { return a.id - b.id; });
            $count.textContent = visibleSpots.length;
            renderDataList(visibleSpots);
        }

        applyFilter();

        const allBounds = L.latLngBounds(markerEntries.map(function (e) { return [e.group.lat, e.group.lng]; }));
        if (allBounds.isValid()) {
            map.fitBounds(allBounds, { padding: [40, 40] });
        }

        // --- フィルターUI構築 ---
        function buildChipList(containerId, values, activeSet, labelFn, colorFn) {
            const container = document.getElementById(containerId);
            values.forEach(function (value) {
                const label = document.createElement('label');
                label.className = 'filter-chip active';
                const dotHtml = colorFn ? '<span class="chip-dot" style="background:' + colorFn(value) + '"></span>' : '';
                label.innerHTML = '<input type="checkbox" checked>' + dotHtml + '<span>' + escapeHtml(labelFn(value)) + '</span>';
                const checkbox = label.querySelector('input');
                checkbox.addEventListener('change', function () {
                    if (checkbox.checked) {
                        activeSet.add(value);
                        label.classList.add('active');
                    } else {
                        activeSet.delete(value);
                        label.classList.remove('active');
                    }
                    applyFilter();
                });
                container.appendChild(label);
            });
        }

        buildChipList('year-filter-list', years, activeYears, function (y) { return y + '年度'; }, null);
        buildChipList('theme-filter-list', themes, activeThemes, function (t) { return t; }, function (t) { return themeColorMap[t]; });

        document.querySelectorAll('.filter-all-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                const group = btn.getAttribute('data-group');
                const action = btn.getAttribute('data-action');
                const containerId = group === 'year' ? 'year-filter-list' : 'theme-filter-list';
                const container = document.getElementById(containerId);
                const checkboxes = container.querySelectorAll('input[type=checkbox]');
                const makeActive = action === 'all';
                checkboxes.forEach(function (cb) {
                    if (cb.checked !== makeActive) {
                        cb.checked = makeActive;
                        cb.dispatchEvent(new Event('change'));
                    }
                });
            });
        });

        // --- 絞り込みセクションの開閉（アコーディオン） ---
        document.querySelectorAll('.filter-section-head').forEach(function (head) {
            head.addEventListener('click', function () {
                head.closest('.filter-section').classList.toggle('collapsed');
            });
        });
    }
})();
