const pgp = require('pg-promise')()
const connectionString = process.env.DATABASE_URL || ''
var db = pgp(process.env.DATABASE_URL || {database: 'booky'})

//a function called getAllBooks
const getAllBooks = ( page = 1 ) => {
  //creates a constant called offset that sets what the pagination limit is going to be
  const offset = ( page - 1 ) * 10
  //creates a constant sql that performs a sql query that retrieves all data from table books
  //orders it in ascending order and references the offset constant
  const sql =`
  SELECT
    *
  FROM
    books
  ORDER BY title ASC
  LIMIT 10
  OFFSET $1
  `
  //creates constant that is storing the constant offset that limits what books get returned
  const variables = [offset]
  //returns a promise chain that then combines to a list of books
  return db.manyOrNone( sql, variables ).then( addAuthorsToBooks ).then( addGenresToBooks )
}

const truncatedDesc = ( str ) => {
  let counter = 0
  let description = ''
  for(let des of str){
    if( counter == 20 ) break
    description += des
  }
  return description
}

const getBookById = ( id ) => {
  const sql =
    `SELECT
      *
     FROM
      books
    WHERE
      id=${id}`
  return db.oneOrNone( sql )
}

const getBookByIdWithAuthors = ( id ) => {
  return Promise.all([
    getBookById( id ),
    getAuthorsByBookId( id )
  ]).then(details => {
    const book = details [0]
    book.authors = details[1]
    return book
  })
}

const getBookByIdWithGenres = ( id ) => {
  return Promise.all([
      getBookById( id ),
      getGenresByBookId( id )
    ]).then(details => {
      const book = details[0]
      book.genres = details[1]
      return book
    })
}

const getAuthorsByBookId = ( id ) => {
  const sql = `
  SELECT
    *
  FROM
    authors AS a
  JOIN
    book_authors
  ON
    book_authors.author_id=a.id
  WHERE
    book_authors.book_id= ${ id }`
  const variables = [id]
  return db.manyOrNone( sql, variables )
}

const getGenresByBookId = ( id ) => {
  const sql = `
  SELECT *
   FROM
    genres AS g
   JOIN
    book_genres
   ON
    book_genres.genre_id=g.id
   WHERE
    book_genres.book_id=${id}`
  const variables = [id]
  return db.manyOrNone( sql, variables )
}

const findBooks = ( query, page = 1 ) => {
  const offset = ( page-1 ) * 10
  const sql = `
    SELECT DISTINCT
      books.*
    FROM
      books
    JOIN
      book_authors
    ON
      book_authors.book_id = books.id
    JOIN
      authors
    ON
      book_authors.author_id = authors.id
    JOIN
      book_genres
    ON
      book_genres.book_id = books.id
    JOIN
      genres
    ON
      book_genres.genre_id = genres.id
    WHERE
      LOWER(books.title) LIKE $1
    OR
      LOWER(books.description) LIKE $1
    OR
      LOWER(authors.name) LIKE $1
    OR
      LOWER(genres.name) LIKE $1
    LIMIT
      10
    OFFSET
      $2
  `
  const variables = [
    '%'+query.replace(/\s+/,'%').toLowerCase()+'%',
    offset,
  ]

  return db.manyOrNone( sql, variables ).then( addAuthorsToBooks ).then( addGenresToBooks )

}

const addAuthorsToBooks = ( books ) => {
  return getAuthorsForBooks( books ).then( authors => {
    books.forEach( book => {
      book.authors = authors.filter( author =>
      author.book_id === book.id
      )
    })
    return books
  })
}

const addGenresToBooks = ( books ) => {
  return getGenresForBooks( books ).then( genres => {
    books.forEach(book => {
      book.genres = genres.filter( genre =>
        genre.book_id === book.id
      )
    })

    return books
  })
}


const getAuthorsForBooks = ( books ) => {
  if ( books.length === 0 ) return Promise.resolve([])
  const bookIds = books.map( book => book.id )
  const sql = `
    SELECT
      authors.name,
      book_authors.book_id
    FROM
      authors
    JOIN
      book_authors
    ON
      book_authors.author_id = authors.id
    WHERE
      book_authors.book_id IN ($1:csv)`
  return db.manyOrNone( sql, [bookIds] )
}

const getGenresForBooks = ( books ) => {
  if (books.length === 0) return Promise.resolve( [])
  const bookIds = books.map( book => book.id )
  const sql = `
    SELECT
      genres.name,
      book_genres.book_id
    FROM
      genres
    JOIN
      book_genres
    ON
      book_genres.genre_id = genres.id
    WHERE
      book_genres.book_id IN ($1:csv)
  `

  return db.manyOrNone( sql, [bookIds] )
}

const createBook = ( title, author, genre, description, image ) => {

  const sql = `
    INSERT INTO
      books (title, description, image_url)
    VALUES
      ($1, $2, $3)
    RETURNING
      *
  `
  const variables = [
    title,
    description,
    image
  ]
  return Promise.all([
    createAuthor( author ).catch( error => { console.log( 'A', error ); throw error }),
    createGenre( genre ).catch( error => { console.log( 'B', error ); throw error }),
    db.one( sql, variables ).catch( error => { console.log( 'C', error  ); throw error })
  ])
    .then(( [ author, genre, book ] ) => {
      return Promise.all([
        associateBookWithAuthor( book, author ),
        associateBookWithGenre( book, genre ),
      ]).then(() => book )
    })
    .catch( error => {console.log( 'E', error ); throw error})
}

const associateBookWithAuthor = ( book, author ) => {
  const sql = `
    INSERT INTO
      book_authors( book_id, author_id )
    VALUES
      ( $1, $2 )
  `
  return db.any( sql, [book.id, author.id] )
}

const associateBookWithGenre = ( book, genre ) => {
  const sql = `
    INSERT INTO
      book_genres( book_id, genre_id )
    VALUES
      ( $1, $2 )
  `
  return db.any( sql, [book.id, genre.id] )
}

const associateBookAndGenre = ( book, genre ) => {
  const sql = `
    INSERT INTO
      book_genres( book_id, genre_id )
    VALUES
      ( $1, $2 )
  `
  const variables = [book.id, genre.id]
  return db.none( sql, variables )
}

const createAuthor = ( authorName ) => {
  const sql = `
    INSERT INTO
      authors (name)
    VALUES
      ($1)
    RETURNING
      *
  `
  const variables = [authorName]
  return db.one( sql, variables )
}

const createGenre = ( genreName ) => {
  const sql = `
    INSERT INTO
      genres (name)
    VALUES
      ($1)
    RETURNING
      *
  `
  const variables = [genreName]
  return db.oneOrNone( sql, variables )
}
const editAuthor = ( id, author ) => {
  const sql = `
  UPDATE
    authors
  SET name = $2
  WHERE
    id=(SELECT authors.id FROM authors	JOIN book_authors ON authors.id = book_authors.author_id
  JOIN books ON book_authors.book_id = books.id WHERE books.id = $1);
  `
  let variables = [ id, author ]
  return db.none( sql, variables )
}
const editGenre = ( id, genre ) => {

  const sql = `
  UPDATE
    genres
  SET name = $2
  WHERE
    id=(SELECT genres.id FROM genres JOIN book_genres ON genres.id = book_genres.genre_id
  JOIN books ON book_genres.book_id = books.id WHERE books.id = $1);
  `
  let variables = [ id, genre ]
  return db.none( sql, variables )
}

const editBook = ( id, title, image, description  ) => {

  const sql = `
  UPDATE
    books
  SET title = $2, image_url = $3, description = $4
  WHERE
    id=$1;
    `
  let variables = [id, title, image, description]
  return db.none( sql, variables )
}
const editWholeBook = ( id, title, author, genre, image, description ) => {
  return Promise.all([
    editBook(id, title, description, image),
    editAuthor(id, author),
    editGenre(id, genre)
  ])
  .catch( error => console.log( 'error!!!!!!!!!!!!!!!!',error ) )
}

const deleteBook = ( bookId ) => {
  const sql = `
    DELETE FROM
      books
    WHERE
      id=${bookId}
  `
  const variables = [bookId]
  return db.none( sql, variables )
}

const getAuthorForBookId = ( bookId ) => {
  const sql = `
    SELECT
      *
    FROM
      authors
    JOIN
      book_authors
    ON authors.id = book_authors.author_id
    WHERE
      book_authors.book_id = ${bookId}
  `
  return db.any( sql, [ bookId ] )
}
  const getGenreForBookId = ( bookId ) => {
  const sql = `
  SELECT
      *
  FROM
    genres
  JOIN
    book_genres
  ON
    genres.id = book_genres.genre_id
  WHERE
    book_genres.book_id = ${bookId}
  `
  return db.any( sql, [bookId] )
}

const getBookWithAuthorsAndGenres = ( bookId ) => {
  return Promise.all([
    getBookById( bookId ),
    getAuthorForBookId( bookId ),
    getGenreForBookId( bookId ),
  ]).then(( [book, authors, genres] ) => {
    // book.authors = authors
    // book.genres = genres
    const bookInfo = {
      book,
      authors,
      genres
    }
    return bookInfo
  })

}

module.exports = {
  getAllBooks,
  getBookById,
  getBookWithAuthorsAndGenres,
  getGenreForBookId,
  getAuthorForBookId,
  getGenresByBookId,
  createBook,
  createGenre,
  createAuthor,
  findBooks,
  deleteBook,
  editWholeBook,
  editGenre,
  editAuthor,
  editBook
}
