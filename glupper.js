// game tick sizes may be 1 (hourly) = 8760 ticks; 24 (daily) = 365 ticks; 168 (weekly) = 52 ticks;
let tickSize = 1;
let tick = 0;
let users = 1;
let sentiment = 100;


let friendsInvited = 0;
function tellYourFriends () {
    let to_add = 0.01;
    if (friendsInvited < 50) {
        to_add = 1;
    } else if (friendsInvited < 100) {
        to_add = 0.5;
    } else if (friendsInvited < 200) {
        to_add = 0.25;
    } else if (friendsInvited < 400) {
        to_add = 0.125;
    } else if (friendsInvited < 500) {
        to_add = 0.06;
    } else if (friendsInvited < 1000) {
        to_add = 0.03;
    }
    users += to_add;
    friendsInvited += to_add;
}

function raiseFinancing () {
    // multiple scales with base-10 log of user count to reflect shrinking multiples at scale
    // examples of users: multiples :: 100 : 25, 1000: 23, 100K: 18, 10M: 13.8, 1B: 9.3
    const user_multiple = 30 - Math.log(users)
    // examples of sentiment: multiples :: 100 : 10, 95: 8.1, 90: 6.4, 80: 3.6, 70: 1.0
    const sentiment_multiple = (((sentiment - 50)/5)^2) / 10
    // adjust multiple up or down in the random interval of [-25%, +25%]
    const random_multiple_adjustment = (math.random() - 0.5) / 2
    const multiple =  Math.max(user_multiple, 1) * Math.max(sentiment_multiple, 1) * random_multiple_adjustment;
    // add some random cash for the early game
    return (multiple * users) + (math.random() * 10000)
};

function calculateChurnProbability () {
    // return the probability of a given user churning in this very tick

    // first, calculate the annualized churn probability.
    let baseProbability = 0.5;
    // e.g. 100 sentiment = 0.5; 50 sentiment = 0.75; 25 sentiment = 0.875; 0 sentiment = 1.0;
    let adjustedForSentiment = baseProbability + (0.5 * (100 - sentiment));

    // now adjust the annual rate down to the tick size.
    // for two binomial distributions X1 ~ (n1, p1) and X2 ~ (n2, p2) where P(X1 <= x1) == P(X2 <= x2), we have n1p1 = n2p2
    // so p2 = n1p1/n2
    // here we have n1 == 1 (year) and p1 == adjustedForSentiment since it's the annualized churn probability
    // so p2 = p1/n2 where n2 == (365 * 24 / tickSize)
    // clean that that works. (does it? i did not prove this result)

    if (tickSize === 1) {
        return adjustedForSentiment/8760;
    } else if (tickSize === 24) {
        return adjustedForSentiment/365;
    } else if (tickSize === 168) {
        return adjustedForSentiment/52;
    }
}

function paintInterface () {
    let day = Math.floor(tick / 24);
    let hour = Math.floor(tick % 24);
    document.getElementById("day").innerHTML = day;
    document.getElementById("hour").innerHTML = hour;
    document.getElementById("globalUsers").innerHTML = Math.floor(users);
}

function advanceTime () {
    tick += gameTickSize;
}

function gameLoop (action) {
    if (action === "tellYourFriends") {
        tellYourFriends();
    }

    advanceTime();
    paintInterface();
}

paintInterface();