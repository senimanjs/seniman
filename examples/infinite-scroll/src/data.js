
// await sleep function
export async function sleep(ms) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
}

let seed = 234234;

// function to generate a consistent random number between 1 and 4 (inclusive) based on two arguments: an input number and a random seed
export function getRandomNumber(input) {
  let random = Math.floor(Math.sin(input * seed) * 10000);

  if (random < 0) {
    random = random * -1;
  }

  return random % 4 + 1;
}

export async function getStreamTweets(streamPath, offset = 0, count = 10) {

  let tweetIds = await getStreamTweetIds(streamPath, offset, count);
  let tweets = await Promise.all(tweetIds.map((tweetId) => getTweet(tweetId)));

  await sleep(10);

  return tweets;
}

export async function getStreamTweetIds(streamPath, offset = 0, count = 10) {

  if (streamPath.startsWith('feed')) {
    let ids = [];

    for (let i = 1; i <= count; i++) {
      ids.push(i + offset);
    }

    return ids;

  } else {

    let tweetId = parseInt(streamPath.split(':')[1]);
    let ids = [];

    for (let i = 1; i <= count; i++) {
      ids.push(tweetId * 100 + i + offset);
    }

    return ids;
  }
}

export async function getTweet(tweetId) {

  return new Promise((resolve, reject) => {
    setTimeout(() => {
      let content = "This is tweet content of id " + tweetId + ".";

      let paragraphCount = getRandomNumber(tweetId);

      for (let i = 0; i < paragraphCount; i++) {
        content += "\nThis is paragraph " + (i + 1) + ".";
      }

      resolve({
        id: tweetId,
        content: content
      });
    }, 10);
  });
}