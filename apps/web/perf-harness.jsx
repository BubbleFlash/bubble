import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "/src/store/auth.tsx";
import { MusicPlayerProvider } from "/src/store/music.tsx";
import PostList from "/src/components/PostList.tsx";
import { prepareImage, AVATAR_PHOTO, POST_PHOTO } from "/src/lib/images.ts";
import AssetImage from "/src/components/AssetImage.tsx";
import { useMusicTime } from "/src/store/music.tsx";
import "/src/styles/global.css";
import "/src/styles/theme.css";
import "/src/styles/aero-tokens.css";
import "/src/styles/aero-themes.css";
import "/src/styles/aero-components.css";
import "/src/styles/aero-shell.css";
import "/src/styles/aero-home.css";
window.prepareImage = prepareImage;
window.photoOptions = { avatar: AVATAR_PHOTO, post: POST_PHOTO };
window.__commits = [];
const posts = Array.from({ length: 60 }, (_, i) => ({
  id: String(i),
  author: { id: "author", username: "author", plus: false },
  content: "Тестовая запись " + i + " https://example.test/" + i,
  createdAt: "2026-11-17T00:00:00Z",
  likeCount: 0,
  likedByMe: false,
  commentCount: 0,
  repostCount: 0,
  musicAttachments: [
    { id: "track-" + i, title: "Тестовый трек", artist: "Исполнитель", duration: 120 },
  ],
}));
const query = {
  data: { pages: [{ items: posts, nextCursor: null }] },
  isSuccess: true,
  hasNextPage: false,
  fetchNextPage: () => {},
};
const h = React.createElement;
const { Profiler } = React;
function ClockProbe() {
  return h("output", { id: "clock-probe", style: { display: "none" } }, String(useMusicTime()));
}
const imageRoot = document.createElement("div");
imageRoot.id = "image-check";
document.body.appendChild(imageRoot);
const mediaRoot = ReactDOM.createRoot(imageRoot);
window.showImage = (src) =>
  mediaRoot.render(h(AssetImage, { src, alt: "Проверка загрузки", width: 40, height: 40 }));
const feed = h(
  Profiler,
  {
    id: "feed",
    onRender: (...args) => window.__commits.push({ phase: args[1], duration: args[2] }),
  },
  h(PostList, { query, inlineComments: true, emptyMessage: "" }),
);
const shell = h(
  "div",
  { className: "aero-app aero-home" },
  h(
    "div",
    { className: "aero-window" },
    h("div", { className: "shell" }, h("main", { className: "container" }, feed)),
  ),
);
ReactDOM.createRoot(document.getElementById("root")).render(
  h(
    QueryClientProvider,
    { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
    h(MemoryRouter, {}, h(AuthProvider, {}, h(MusicPlayerProvider, {}, shell, h(ClockProbe)))),
  ),
);
