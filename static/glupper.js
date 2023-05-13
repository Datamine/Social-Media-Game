// js utilities
import binomial from 'https://cdn.jsdelivr.net/gh/stdlib-js/random-base-binomial@esm/index.mjs';

// https://stackoverflow.com/questions/149055/how-to-format-numbers-as-currency-strings
function financial(x) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(x);
}

// https://stackoverflow.com/questions/45163256/how-to-format-numbers-as-percentage-values-in-javascript
function percentage(x) {
    return `${(x * 100).toFixed(2)}%`;
}

// game tick sizes may be 1 (hourly) = 8760 ticks; 24 (daily) = 365 ticks; 168 (weekly) = 52 ticks;
let tickSize = 24;
let tick = 0;
let users = 1;
// 1 - 100 scale
let sentiment = 100;
// can the user see sentiment?
let sentiment_visible = false;

// 0 - 1 scale (percentage)
let ownership = 1;
let money = 0;
// 0 - 10 scale
let ad_level = 0;
// $25 per year turned into hourly ticks
const ad_base_rate = 25 / 365 / 24;


let financingOffer = null;

// GAME CLOCK

function getAdRevenueInTimestep () {
    // theoretical max revenue of about 300/user/y but not in practice
    // since ad level will take down user sentiment
    let revenue = 0;
    if (ad_level > 0) {
        // start off at 2.72 since that's 1 on log scale
        revenue = Math.log(1.72 + ad_level)**2 * ad_base_rate * users;
    }
    money += revenue;
}

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

    let churnProbability = adjustedForSentiment/(8760/tickSize);
    // console.log(churnProbability)
    return churnProbability;
}

function churn () {
    const churned_users = binomial(users, calculateChurnProbability());
    users -= churned_users;
}

function paintInterface () {
    let day = Math.floor(tick / 24);
    let hour = Math.floor(tick % 24);
    document.getElementById("day").innerHTML = day;
    document.getElementById("hour").innerHTML = hour;
    document.getElementById("globalUsers").innerHTML = parseInt(users);
    document.getElementById("money").innerHTML = financial(money);
    document.getElementById("ownership").innerHTML = percentage(ownership);
    document.getElementById("sentiment").innerHTML = sentiment_visible ? sentiment : sentiment; //"Unknown";
    document.getElementById("adLevel").innerHTML = ad_level;

    // ad level buttons
    let disable_increase = ad_level == 10 ? "disabled" : "";
    let disable_decrease = ad_level == 0 ? "disabled" : "";
    document.getElementById("adLevelButtons").innerHTML = `
    <button onClick="actionHandler('increaseAdLevel')" ${disable_increase}>Increase</button>
    <button onClick="actionHandler('decreaseAdLevel')" ${disable_decrease}>Decrease</button>
    `;

}

function advanceTime () {
    tick += tickSize;
}

function calculateOrganicGrowthProbability () {
    // return the probability of a given user referring another user in this very tick

    // first, calculate the annualized expected number of referred users.
    // sentiment 100 : 3.0, 90: 2.43, 80: 1.92, 70: 1.47, 60: 1.08, below that 1.0
    let annual_virality_ev = Math.max(1.0, (sentiment **2) / 3333);
    // make it slightly less effective so that at 100m users it levels out at 1.5
    annual_virality_ev = annual_virality_ev / (1+(Math.min(users,100000000)/100000000))
    // TODO remove or include jitter? annual_virality_ev = annual_virality_ev * jitter(0.75, 1.25);


}

function organicGrowth () {


    // the above is annualized so we need to make it tick-sized
    // if we have x^365 = p then x = 365th root of p = p^(1/365)
    const tick_virality_factor = Math.pow(pop_adjusted_annual_virality_noised, 1/(8760/tickSize));

    console.log(tick_virality_factor * users - users);
    const new_users = Math.round(tick_virality_factor * users - users);
    console.log(new_users);
    users += new_users;
}

// USER ACTIONS

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

function jitter (lower_bound, upper_bound) {
    // returns a uniform probability between the upper and lower bound
    // e.g. jitter (.75, 1.25) will have mean 1

    const interval_width = upper_bound - lower_bound;
    const random_sample = Math.random() * interval_width;

    return lower_bound + random_sample;
}

function raiseFinancing () {
    // multiple scales with base-10 log of user count to reflect shrinking multiples at scale
    // examples of users: multiples :: 100 : 25, 1000: 23, 100K: 18, 10M: 13.8, 1B: 9.3
    const user_multiple = 30 - Math.log(users)
    // examples of sentiment: multiples :: 100 : 10, 95: 8.1, 90: 6.4, 80: 3.6, 70: 1.0
    const sentiment_multiple = (((sentiment *- 50)/5)^2) / 10
    // adjust multiple up or down in the random interval of [-25%, +25%]
    const random_multiple_adjustment = 0.75 + (Math.random() / 2)
    const multiple =  Math.max(user_multiple, 1) * Math.max(sentiment_multiple, 1) * random_multiple_adjustment;
    // add some random cash for the early game
    // second parameter: dilution, always in [0.1, 0.3] interval
    const dilution = jitter(0.1, 0.3)
    financingOffer = [(multiple * users) + (Math.random() * 10000), dilution]
};

function acceptFinancing () {
    money += financingOffer[0];
    ownership = ownership * (1 - financingOffer[1]);
    financingOffer = null;
}

function declineFinancing () {
    financingOffer = null;
}

function increaseAdLevel () {
    ad_level += 1;
    if (ad_level >= 4) {
        sentiment -= 2;
    } else {
        sentiment -= 1;
    }
}

function decreaseAdLevel () {
    ad_level -= 1;
    if (ad_level >= 3) {
        sentiment += 2;
    } else {
        sentiment += 1;
    }
}

window.actionHandler = (action) => {
    let output = '';
    let input = '';
    console.log(action);

    if (action === "tellYourFriends") {
        tellYourFriends();
    } else if (action === "raiseFinancing") {
        raiseFinancing();
        output = `You have been offered ${financial(financingOffer[0])} for ${percentage(financingOffer[1])} of the company. Do you accept?`
        input = `<button onClick="actionHandler('acceptFinancing')">Accept</button><button onClick="actionHandler('declineFinancing')">Decline</button>`
    } else if (action === "acceptFinancing") {
        acceptFinancing();
    } else if (action === "declineFinancing") {
        declineFinancing();
    } else if (action === "increaseAdLevel") {
        increaseAdLevel();
    } else if (action === "decreaseAdLevel") {
        decreaseAdLevel();
    }

    document.getElementById("gameOutputContainer").innerHTML = output;
    document.getElementById("gameInputContainer").innerHTML = input;
    paintInterface();
}

paintInterface();

function gameLoop () {
    // 1 second per tick game loop
    setTimeout(() => {
        advanceTime();
        organicGrowth();
        churn();
        getAdRevenueInTimestep();
        paintInterface();
        gameLoop();
    }, 1000);
}

gameLoop();