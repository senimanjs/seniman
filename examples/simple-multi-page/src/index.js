import { Style } from 'seniman/head';
import { useState, useClient, useMemo, useEffect, onDispose, Anchor } from 'seniman';
import { createServer } from 'seniman/server';

let server = createServer({ Body });

let port = 3015;
server.listen(port);
console.log('Listening on port', port);

const cssText = `
body,
* {
  padding: 0;
  margin: 0;
  font-family: sans-serif;
}

body {
  padding: 10px;
}
`;

let fakeMovieData = [
  { id: 1, title: "The Matrix" },
  { id: 2, title: "The Matrix Reloaded" },
  { id: 3, title: "The Matrix Revolutions" },
];

async function loadAllMovieData() {
  // simulate network delay of 10ms
  await new Promise(resolve => setTimeout(resolve, 10));

  return fakeMovieData;
}

async function loadMovieData(movieId) {
  // simulate network delay of 10ms
  await new Promise(resolve => setTimeout(resolve, 10));
  return fakeMovieData.find(movie => movie.id == movieId);
}

function MoviePage() {
  let client = useClient();
  let [movieData, setMovieData] = useState(null);

  let movieId = useMemo(() => {
    let path = client.path();
    return path.split("/")[2];
  });

  useEffect(async () => {
    let _movieId = movieId();
    let movieData = await loadMovieData(_movieId);

    setMovieData(movieData);
  });

  onDispose(() => {
    console.log('Leaving movie page');
  });

  return <div>
    <div>
      <div>Movie ID: {movieId}</div>
      {
        movieData() ?
          <div>Movie Title: {movieData().title}</div> :
          <div>Loading movie data...</div>
      }
    </div>
  </div>;
}

function MoviesPage() {
  let [movies, setMovies] = useState([]);

  useEffect(async () => {
    let _movies = await loadAllMovieData();

    setMovies(_movies);
  });

  return <div>
    <div>
      {movies().map(movie =>
        <div>
          <Anchor href={'/movie/' + movie.id}>{movie.title}</Anchor>
        </div>
      )}
    </div>
  </div>
}

function Body() {
  let client = useClient();

  let pageType = useMemo(() => {
    let pathname = client.location.pathname();

    if (pathname === "/") {
      return "movies";
    } else if (pathname.startsWith("/movie/")) {
      return "movie";
    } else {
      return "404";
    }
  });

  return <div>
    <Style text={cssText} />
    <div style={{ marginBottom: "10px", fontWeight: "bold" }}>Seniman</div>
    <div>
      {() => {
        // This function is re-run only when pageType changes
        let _pageType = pageType();

        switch (_pageType) {
          case "movie":
            return <MoviePage />;
          case "movies":
            return <MoviesPage />;
          default:
            return <div>404</div>;
        }
      }}
    </div>
  </div>;
}