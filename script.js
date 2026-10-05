// ---------------------------------------------------------------------------
// HW3 — Collaborative Filtering core
//
// Missing-value strategy (see week3/readme.md section 6). Choose EXACTLY ONE
// and keep it consistent in cosineSimilarity below:
//
//   [ ] use co-rated entries only
//   [ ] mean imputation
//   [ ] weight similarity by the number of co-rated items
//
// Delete the two you did not choose.
// ---------------------------------------------------------------------------

// Initialize the application when the window loads
window.onload = async function() {
    const userBased = document.getElementById('user-based-result');
    const itemBased = document.getElementById('item-based-result');

    try {
        userBased.innerHTML = '<p>Loading movie data...</p>';
        itemBased.innerHTML = '<p>Loading movie data...</p>';

        await loadData();

        populateUserDropdown();

        userBased.innerHTML = '<p>Data loaded. Select a user.</p>';
        itemBased.innerHTML = '<p>Data loaded. Select a user.</p>';
    } catch (error) {
        console.error('Initialization error:', error);
        // The error message is already shown by data.js
    }
};

// Populate the user dropdown with one option per user id found in u.data
function populateUserDropdown() {
    const selectElement = document.getElementById('user-select');

    // Clear existing options except the first placeholder
    while (selectElement.options.length > 1) {
        selectElement.remove(1);
    }

    for (let userId = 1; userId <= numUsers; userId++) {
        const option = document.createElement('option');
        option.value = userId;
        option.textContent = `User ${userId}`;
        selectElement.appendChild(option);
    }
}

// ---------------------------------------------------------------------------
// TODO (HW3) — cosine similarity between two rating vectors.
//
// Compare only co-rated (non-zero) entries, per the missing-value strategy
// you chose above. Return 0 when the denominator is 0 (that is, when the two
// vectors share no rated items). See week3/readme.md section 5.3.
//
// Inputs: two arrays of equal length (slice the rating matrix column or row).
// Output: a number in [0, 1].
// ---------------------------------------------------------------------------
function cosineSimilarity(a, b) {
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;
    let commonItems = 0;

    // Use only co-rated items
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== 0 && b[i] !== 0) {
            dotProduct += a[i] * b[i];
            magnitudeA += a[i] * a[i];
            magnitudeB += b[i] * b[i];
            commonItems++;
        }
    }

    // Not enough common ratings to establish reliable similarity
    if (commonItems < 5) {
        return 0;
    }

    const denominator =
        Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);

    if (denominator === 0) {
        return 0;
    }

    return dotProduct / denominator;
}
// ---------------------------------------------------------------------------
// TODO (HW3) — User-Based CF.
//
// Return the top-K recommendations for the active user as an array of
// { title, score }, sorted by score descending.
//
// Suggested steps (week3/readme.md section 5.4):
//   1. compare the active user's rating vector against every other user
//   2. take the N most similar users with positive similarity (e.g. N = 20)
//   3. for each movie the active user has NOT rated, predict a score as the
//      similarity-weighted average of those users' ratings
//   4. sort and take the top K
// ---------------------------------------------------------------------------
function getUserBasedRecommendations(activeUserId, topK = 5) {
    const activeRatings = ratingMatrix[activeUserId];

    // Compare active user with every other user
    const similarities = [];

    for (let userId = 1; userId <= numUsers; userId++) {
        if (userId === activeUserId) continue;

        const similarity = cosineSimilarity(
            activeRatings,
            ratingMatrix[userId]
        );

        if (similarity > 0) {
            similarities.push({
                userId,
                similarity
            });
        }
    }

    // Keep the 20 most similar users
    similarities.sort((a, b) => b.similarity - a.similarity);
    const neighbors = similarities.slice(0, 20);

    console.log("Top 20 similar users:", neighbors);

    const predictions = [];

    // Evaluate every movie
    for (let movieId = 1; movieId <= numMovies; movieId++) {

        // Skip movies already rated by active user
        if (activeRatings[movieId] !== 0) {
            continue;
        }

        let weightedSum = 0;
        let similaritySum = 0;

        for (const neighbor of neighbors) {
            const rating = ratingMatrix[neighbor.userId][movieId];

            if (rating !== 0) {
                weightedSum += neighbor.similarity * rating;
                similaritySum += neighbor.similarity;
            }
        }

        if (similaritySum > 0) {
            const score = weightedSum / similaritySum;

            const movie = movies.find(m => m.id === movieId);

            if (movie) {
                predictions.push({
                    title: movie.title,
                    score
                });
            }
        }
    }

    // Highest predicted scores first
    predictions.sort((a, b) => b.score - a.score);

    return predictions.slice(0, topK);
}

function predictUserBasedRating(activeUserId, targetMovieId, topK = 20) {
    const activeRatings = ratingMatrix[activeUserId];
    const neighbors = [];

    for (let userId = 1; userId <= numUsers; userId++) {

        if (userId === activeUserId) continue;

        let commonItems = 0;

        for (let movieId = 1; movieId <= numMovies; movieId++) {

            if (
                activeRatings[movieId] !== 0 &&
                ratingMatrix[userId][movieId] !== 0
            ) {
                commonItems++;
            }
        }

        if (commonItems < MIN_COMMON_ITEMS) continue;

        const similarity = cosineSimilarity(
            activeRatings,
            ratingMatrix[userId]
        );

        const rating = ratingMatrix[userId][targetMovieId];

        // Only neighbors who actually rated the target movie
        if (similarity > 0 && rating !== 0) {
            neighbors.push({
                userId,
                similarity,
                rating,
                commonItems
            });
        }
    }

    neighbors.sort(
        (a, b) => b.similarity - a.similarity
    );

    const selectedNeighbors = neighbors.slice(0, topK);

    let weightedSum = 0;
    let similaritySum = 0;

    for (const neighbor of selectedNeighbors) {

        weightedSum +=
            neighbor.similarity * neighbor.rating;

        similaritySum += neighbor.similarity;
    }

    if (similaritySum === 0) {
        return null;
    }

    return weightedSum / similaritySum;
}
// ---------------------------------------------------------------------------
// TODO (HW3) — Item-Based CF.
//
// Return the top-K recommendations for the active user as an array of
// { title, score }, sorted by score descending.
//
// Suggested steps (week3/readme.md section 5.5):
//   1. for each movie the active user has rated, compute the item-item
//      similarity against every other movie's rating column
//   2. for each candidate movie the active user has NOT rated, aggregate the
//      similarities from the rated movies, weighted by the user's rating
//   3. sort and take the top K
// ---------------------------------------------------------------------------
function getItemBasedRecommendations(activeUserId, topK = 5) {

    const userRatings = ratingMatrix[activeUserId];

    const recommendationScores = {};

    // Movies that the user already rated highly
    for (let sourceMovieId = 1; sourceMovieId <= numMovies; sourceMovieId++) {

        const sourceRating = userRatings[sourceMovieId];

        // Only use movies the user liked
        if (sourceRating < 4) continue;

        const sourceRatings = ratingMatrix.map(
            row => row[sourceMovieId]
        );

        // Compare this movie with every other movie
        for (let movieId = 1; movieId <= numMovies; movieId++) {

            // Do not recommend movies already rated by the user
            if (userRatings[movieId] !== 0) continue;

            if (movieId === sourceMovieId) continue;

            const movieRatings = ratingMatrix.map(
                row => row[movieId]
            );

            const similarity = cosineSimilarity(
                sourceRatings,
                movieRatings
            );

            if (similarity <= 0) continue;

            // Create entry for this candidate movie
            if (!recommendationScores[movieId]) {
                recommendationScores[movieId] = {
                    weightedScore: 0,
                    similaritySum: 0
                };
            }

            // similarity × user's rating
            recommendationScores[movieId].weightedScore +=
                similarity * sourceRating;

            recommendationScores[movieId].similaritySum +=
                similarity;
        }
    }

    // Convert scores into recommendation objects
    const recommendations = Object.entries(recommendationScores)
        .map(([movieId, data]) => ({
            movieId: Number(movieId),

            score:
                data.weightedScore /
                data.similaritySum
        }))

        // Highest predicted score first
        .sort((a, b) => b.score - a.score)

        // Return only requested number
        .slice(0, topK);

    return recommendations;
}

// Provided — read the selected user and render both recommendation lists
function getRecommendations() {
    const selectElement = document.getElementById('user-select');
    const userId = parseInt(selectElement.value, 10);

    if (isNaN(userId)) {
        renderList('user-based-result', [], 'Please select a user first.');
        renderList('item-based-result', [], 'Please select a user first.');
        return;
    }

    renderList('user-based-result', getUserBasedRecommendations(userId));
    renderList('item-based-result', getItemBasedRecommendations(userId));
}

// Provided — render a list of { title, score } into the given element
function renderList(elementId, items, message) {
    const el = document.getElementById(elementId);

    if (message) {
        el.innerHTML = `<p>${message}</p>`;
        return;
    }

    if (!items || items.length === 0) {
        el.innerHTML = '<p>No recommendations. (Implement the TODO above.)</p>';
        return;
    }

    const entries = items
        .map(item => `<li>${item.title} &mdash; ${Number(item.score).toFixed(3)}</li>`)
        .join('');
    el.innerHTML = `<ul>${entries}</ul>`;
}
