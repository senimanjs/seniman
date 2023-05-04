import { useState, useClient, createCollection, createModule, createContext, useContext, createHandler, untrack, createRef } from "seniman";
import { LoveIcon, ReplyIcon, RetweetIcon, ShareIcon } from "./icons.js";
import { Link } from "./router.js";
import { getStreamTweets } from "./data.js";

const ScrollerContext = createContext(null);

export function useScroller() {
  return useContext(ScrollerContext);
}

export function ScrollerProvider(props) {
  return <ScrollerContext.Provider value={props.scrollerRef}>
    {props.children}
  </ScrollerContext.Provider>;
}

export function Scroller(props) {
  let scrollerRef = createRef();
  let client = useClient();

  setTimeout(() => {
    client.exec($c(() => {
      // set the height of the scroller to the height of the viewport
      $s(scrollerRef).get().style.height = window.innerHeight + "px";
    }));
  }, 0);

  return <div ref={scrollerRef} style={{ overflowY: "scroll" }}>
    <ScrollerProvider scrollerRef={scrollerRef}>
      {props.children}
    </ScrollerProvider>
  </div>;
}

export function TweetInfiniteStream(props) {
  let client = useClient();
  let tweetCollection = createCollection([]);
  let offset = 0;
  let countPerLoad = 20;
  let [topPlaceholderHeight, setTopPlaceholderHeight] = useState(0);
  let [isLoading, setIsLoading] = useState(false);
  let [reachesBottom, setReachesBottom] = useState(false);

  let tweetsContainerRef = createRef();
  let scrollerRef = useScroller();
  let streamPath = untrack(() => props.streamPath);

  let batchHeightList = [];
  let tweetDataList = [];

  let batchStartIndex = 0;
  let batchEndIndex = 0;
  let topReloadLine = 0;

  let heightReportHandler = createHandler((batchIndex, batchEndIndex, height) => {

    let prevBatchHeight = 0;

    for (let i = batchIndex; i <= batchEndIndex; i++) {

      if (i == batchEndIndex) {
        batchHeightList[i] = height - prevBatchHeight;
      } else {
        prevBatchHeight += batchHeightList[i];
      }
    }

    // start shaving the top batch and update topPlaceholderHeight
    if ((batchEndIndex - batchStartIndex) >= 2) {
      let shavedBatchHeight = batchHeightList[batchStartIndex];

      tweetCollection.splice(0, countPerLoad);

      setTopPlaceholderHeight((topPlaceholderHeight) => {
        return topPlaceholderHeight + shavedBatchHeight;
      });

      // update the line above which we should reload the top batch (when user scrolls up)
      topReloadLine += shavedBatchHeight;
      batchStartIndex++;
    }
  });

  let executeHeightReport = (batchStartIndex, batchEndIndex) => {

    setTimeout(() => {
      client.exec($c(() => {
        let tweetsContainer = $s(tweetsContainerRef).get();

        // get the height of the tweets container
        let tweetsContainerHeight = tweetsContainer.getBoundingClientRect().height;

        $s(heightReportHandler)($s(batchStartIndex), $s(batchEndIndex), tweetsContainerHeight);
      }));
    }, 10);
  }

  let loadBatch = () => {

    getStreamTweets(streamPath, offset, countPerLoad).then(tweets => {
      let endOffset = offset + countPerLoad;

      tweetCollection.push(...tweets);

      // store the tweets data for when we need to reload the earlier batches as we scroll up
      tweetDataList.push(...tweets);

      executeHeightReport(batchStartIndex, batchEndIndex);

      // update batchEndIndex
      batchEndIndex = Math.floor(endOffset / countPerLoad);
    });
  }

  let reloadTopBatch = () => {

    if (batchStartIndex == 0) {
      return;
    }

    let batchIndex = batchStartIndex - 1;

    let reloadStartOffset = batchIndex * countPerLoad;
    let reloadTweets = tweetDataList.slice(reloadStartOffset, reloadStartOffset + countPerLoad);

    tweetCollection.splice(0, 0, ...reloadTweets);

    // reduce topPlaceholderHeight based on the newly reloaded top batch recorded height
    setTopPlaceholderHeight((topPlaceholderHeight) => {
      return topPlaceholderHeight - batchHeightList[batchIndex];
    });

    batchStartIndex -= 1;
    topReloadLine -= batchHeightList[batchIndex];
  }

  let loadMoreTweets = () => {
    if (reachesBottom()) {
      return;
    }

    offset += countPerLoad;

    loadBatch();

    if ((offset + countPerLoad) >= 500) {
      setReachesBottom(true);
    }

    setIsLoading(true);
  };

  let lastScrollTop = 0;

  let reportScrollParameters = createHandler((scrollTop, scrollHeight, clientHeight) => {

    // if scroll position is about 200px from the bottom, load more tweets
    if (scrollTop > lastScrollTop && (scrollHeight - clientHeight - scrollTop) < 500) {
      loadMoreTweets();
    } else if (scrollTop < lastScrollTop && scrollTop < (topReloadLine + 400)) {
      reloadTopBatch();
    }

    lastScrollTop = scrollTop;
  });

  setTimeout(() => {
    client.exec($c(() => {
      let throttle = $s(ThrottleModule);
      let scrollerEl = $s(scrollerRef).get();

      scrollerEl.addEventListener('scroll', throttle(() => {
        let scrollTop = scrollerEl.scrollTop;
        let scrollerHeight = scrollerEl.scrollHeight;

        // get browser viewport height
        let viewportHeight = window.innerHeight;

        $s(reportScrollParameters)(scrollTop, scrollerHeight, viewportHeight);
      }, 250));
    }));
  }, 0);

  loadBatch();

  return <div>
    <div style={{ height: `${topPlaceholderHeight()}px` }}></div>
    <div ref={tweetsContainerRef}>
      {tweetCollection.map(tweet => {
        return <TweetCompactView tweet={tweet} />
      })}
    </div>
    {reachesBottom() ?
      <div style={{ padding: "5px 0" }}>You've reached the bottom</div> :
      () => {
        return isLoading() ? <div style={{ padding: "5px 0" }}>Loading...</div> : null;
      }
    }
  </div>;
}

function _breakTweetTextToParagraphs(text) {
  let paragraphs = text.split("\n");

  return paragraphs.map((paragraph, index) => {
    return <div key={index} style={{ marginTop: "10px" }}>
      {paragraph}
    </div>;
  });
}

function TweetCompactView(props) {

  return <Link name="tweet" params={{ tweet_id: props.tweet.id }}>
    <div style={{ padding: "10px", border: "1px solid #444", marginBottom: "-1px", display: "flex" }}>
      <div style={{ width: "45px", flexShrink: "0" }}>
        <img src="https://pbs.twimg.com/profile_images/1456569850126426112/l2VJ1Nvm_400x400.jpg" style={{ width: "45px" }} />
      </div>
      <div style={{ paddingLeft: "10px", flexGrow: "1" }}>
        <div style={{ fontSize: "13px" }}>
          <span style={{ fontWeight: "bold", color: "#e7e7e7" }}>User Name</span>
          <span style={{ color: "#aaa" }}>
            <span>@username</span>
            <span>&bull;</span>
            <span>1h</span>
          </span>
        </div>
        <div style={{ fontSize: "13px", marginTop: "10px", color: "#e7e7e7" }}>
          {_breakTweetTextToParagraphs(props.tweet.content)}
        </div>
        <div style={{ marginTop: "10px" }}>
          <span style={{ marginRight: '20px' }}>
            <ReplyIcon />
          </span>
          <span style={{ marginRight: '20px' }}>
            <RetweetIcon />
          </span>
          <span style={{ marginRight: '20px' }}>
            <LoveIcon />
          </span>
          <span>
            <ShareIcon />
          </span>
        </div>
      </div>
    </div>
  </Link>;
}

let ThrottleModule = createModule($c(() => {

  let throttle = (func, delay) => {
    let lastCall = 0;
    let timeoutId;
    let latestArgs;

    return (...args) => {
      latestArgs = args;
      clearTimeout(timeoutId);

      let _now = Date.now();
      if (_now - lastCall >= delay) {
        lastCall = _now;
        func.apply(null, latestArgs);
      } else {
        timeoutId = setTimeout(() => {
          lastCall = Date.now();
          func.apply(null, latestArgs);
        }, delay - (_now - lastCall));
      }
    };
  }

  return throttle;
}));
