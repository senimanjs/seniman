import { useState, useEffect, useMemo, untrack } from "seniman";
import { createServer } from "seniman/server";
import { Style, Link as HeadLink } from "seniman/head";
import { getTweet } from "./data.js";
import { createRouting, RouterRoot, useRouter } from './router.js';
import { Scroller, TweetInfiniteStream } from "./scroller.js";

// uncomment to use cloudflare workers
// import { createServer } from "seniman/workers";

function TweetPage() {
  let router = useRouter();
  let [tweet, setTweet] = useState(null);
  let isTweetLoaded = useMemo(() => tweet() != null);
  let tweetId = untrack(() => router.params().tweet_id);

  useEffect(async () => {
    let tweet = await getTweet(tweetId);

    setTweet(tweet);
  });

  return () => {
    if (!isTweetLoaded()) {
      return <div>
        Loading...
      </div>;
    }

    return <Scroller>
      <div style={{ padding: "10px", border: "1px solid #ccc" }}>
        <div style={{ marginBottom: "-1px", display: "flex" }}>
          <div style={{ width: "45px", flexShrink: "0" }}>
            <img src="https://pbs.twimg.com/profile_images/1630496379650076672/rrgzfSQy_bigger.jpg" style={{ width: "45px", height: "45px", borderRadius: "45px" }} />
          </div>
          <div style={{ paddingLeft: "10px", flexGrow: "1" }}>
            <div style={{ fontSize: "13px" }}>
              <div style={{ fontWeight: "bold", color: "#e7e7e7" }}>User Name</div>
              <div style={{ color: "#777", marginTop: "5px" }}>
                <span>@username1</span>
              </div>
            </div>
          </div>.
        </div>
        <div style={{ paddingTop: "10px", fontSize: "14px" }}>
          {_breakTweetTextToParagraphs(tweet().content)}
        </div>
        <div style={{ marginTop: "10px", fontSize: "13px" }}>
          <span>7:20 PM</span>
          <span>&bull;</span>
          <span>Apr 25, 2023</span>
          <span>&bull;</span>
          <span><span style={{ fontWeight: "bold" }}>5,801</span> Views</span>
        </div>
      </div>
      <div>
        <TweetInfiniteStream streamPath={"replies:" + tweetId} />
      </div>
    </Scroller>;
  };
}

function _breakTweetTextToParagraphs(text) {
  let paragraphs = text.split("\n");

  return paragraphs.map((paragraph, index) => {
    return <div key={index} style={{ marginTop: "10px" }}>
      {paragraph}
    </div>;
  });
}

function HomeFeed() {
  let userId = 1;

  return <Scroller>
    <div style={{ fontSize: "16px", padding: "10px 0" }}>Home</div>
    <TweetInfiniteStream streamPath={"feed:" + userId} />
  </Scroller>
}

let routing = createRouting();
routing.on("/tweet/:tweet_id", "tweet", TweetPage);
routing.on("/", "home", HomeFeed);

function Body() {
  return <div>
    <HeadLink rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reset.css@2.0.2/reset.min.css" />
    <HeadLink rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300..700&display=swap" />
    <Style text={`
      body {
        background: #000;
        color: #fff;
        font-family: Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto,
        Oxygen, Ubuntu, Cantarell, Fira Sans, Droid Sans, Helvetica Neue, sans-serif !important;
      }

      a {
        color: inherit;
        display: block;
        text-decoration: none;
      }
    `} />
    <div style={{ margin: '0 auto', maxWidth: '550px' }}>
      <RouterRoot routing={routing} />
    </div>
  </div>;
}

let server = createServer({ Body });
let port = 3050;
server.listen(port);

console.log(`Listening on port ${port}`);

// uncomment to use cloudflare workers
// export default createServer({ Body });