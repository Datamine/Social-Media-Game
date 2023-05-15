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

let hours_in_tick = 1;
let hour_tick = 0;
let users = 1;

// 0 - 1 scale (percentage)
let ownership = 1;
// 0 - 100 scale just for consistency
let ad_level = 0;

let money = 0;
let marketing_spend = 0;

let financingOffer = null;
let loan_offer = null;
let friendsInvited = 0;
let canRaiseNextOnHourTick = 0;

let changesForTick = {
    users: 0,
    money: 0
};

let team = {
    data_scientist: 0,
    moderator: 0,
    engineer: 0
};

let is_down = false;

const data_scientist_hourly_cost = 50;
const moderator_hourly_cost = 10;
const engineer_hourly_cost = 75;

// hour_tick : amount due
let outstanding_loans = {};

// GAME CLOCK

function ticksInYear() {
    // tick sizes start off at 1 hour by default
    // may increase to 24 and then 168 hours
    // this returns the number of ticks in an annual period
    return 8760/hours_in_tick;
}

function tickName () {
    const mapping = {
        1: "Hour",
        24: "Day",
        168: "Week"
    }
    return mapping[hours_in_tick];
}

function calculateSentiment () {
    // 0 - 100 scale
    let base = 100;
    let ad_level_mapping = {
        0: 0,
        10: -1,
        20: -2,
        30: -3,
        40: -5,
        50: -7,
        60: -9,
        70: -11,
        80: -13,
        90: -15,
        100: -20
    }
    let ad_adjusted = base + ad_level_mapping[ad_level];
    // lazy approach here, scaling the 0-100 to a 0-20 by dividing by 5. figure that the moderation level is already on a reciprocal scale so w/e
    let mod_adjusted = ad_adjusted - Math.round(calculateModerationLevel()/5);
    return Math.max(0, mod_adjusted);
}

function getAdRevenueInTimestep () {
    const annual_ad_revenue = 25;
    const ad_revenue_for_tick = annual_ad_revenue / ticksInYear();

    // theoretical max revenue of about 125/user/y but not in practice
    // since ad level will take down user sentiment
    let revenue = 0;
    if (ad_level > 0) {
        // start off at 2.72 since that's 1 on log scale
        // ad_level/10 => 0 - 10 scale is the original, 0-100 just for consistency
        revenue = Math.log(1.72 + (ad_level/10))**2 * ad_revenue_for_tick * users;
    }
    // TODO: make this a little less deterministic and randomly sample binomial?
    return revenue;
}

function marketingGrowthInTimestep () {
    // Assume $50/y as reasonable per-user rev and a 1-y payback period on CAC, so it should cost about $50 to acquire a user
    // and p(churn) is base at 0.5/y = 2y life expectancy, so this gives the user good economics => basically double their money invested after 2y
    const probabilityPerDollar = 1.0/50;
    // basically binomial probability where every dollar of marketing spend is another trial
    const trials = Math.round(marketing_spend * hours_in_tick);
    if (trials === 0) {
        // binomial can't get computed on 0 trials :rolleyes:
        return [0, 0];
    }
    // return users actually added in timestep, and expected value
    return [binomial(Math.round(marketing_spend * hours_in_tick), probabilityPerDollar), Math.round(marketing_spend * hours_in_tick) * probabilityPerDollar]
}

function marketingSpendInTimestep () {
    return marketing_spend * hours_in_tick
}

function teamSpendInTimestep () {
    return hours_in_tick * (
        (team.data_scientist * data_scientist_hourly_cost) +
        (team.moderator * moderator_hourly_cost)
    );
}

function calculateChurnProbability () {
    // return the probability of a given user churning in this very tick

    // first, calculate the annualized churn probability.
    let baseProbability = 0.5;
    // e.g. 100 sentiment = 0.5; 50 sentiment = 0.75; 25 sentiment = 0.875; 0 sentiment = 1.0;
    let adjustedForSentiment = baseProbability + (0.5 * (100 - calculateSentiment()));

    // now adjust the annual rate down to the tick size.
    // for two binomial distributions X1 ~ (n1, p1) and X2 ~ (n2, p2) where P(X1 <= x1) == P(X2 <= x2), we have n1p1 = n2p2
    // so p2 = n1p1/n2
    // here we have n1 == 1 (year) and p1 == adjustedForSentiment since it's the annualized churn probability
    // so p2 = p1/n2 where n2 == (365 * 24 / tickSize)
    // clean that that works. (does it? i did not prove this result)

    let churnProbability = adjustedForSentiment/ticksInYear();
    // console.log(churnProbability)
    return churnProbability;
}

function churn () {
    // return actual sample, expected value
    return [binomial(Math.round(users), calculateChurnProbability()), Math.round(users) * calculateChurnProbability()];
}

function calculateModerationLevel () {
    if (team.moderator == 0) {
        return 0;
    }
    // return a 0-100 scale
    // bound users_per_mod between 100 and 1000000

    return Math.min(100, (team.moderator * 1000000 / Math.max(100, users))**0.5);
}

function paintInterface () {
    let day = Math.floor(hour_tick / 24);
    let hour = Math.floor(hour_tick % 24);
    document.getElementById("day").innerHTML = day;
    document.getElementById("hour").innerHTML = hour;
    document.getElementById("globalUsers").innerHTML = parseInt(users);
    document.getElementById("money").innerHTML = financial(money);
    document.getElementById("ownership").innerHTML = percentage(ownership);
    // one DS per 1M users
    document.getElementById("sentiment").innerHTML = team.data_scientist > users/1000000 ? calculateSentiment() : "Unknown";
    document.getElementById("adLevel").innerHTML = ad_level;
    document.getElementById("modLevel").innerHTML = Math.round(calculateModerationLevel());

    // team
    let disable_fire_data_scientist = team.data_scientist == 0 ? "disabled" : "";
    document.getElementById("dataScientistCost").innerHTML = `${financial(team.data_scientist * data_scientist_hourly_cost * hours_in_tick)} per ${tickName()}`;
    document.getElementById("dataScientistButtons").innerHTML = `
        <button onClick="actionHandler('hireDataScientist')">Hire for ${financial(data_scientist_hourly_cost * hours_in_tick)} per ${tickName()} </button>
        <button onClick="actionHandler('fireDataScientist')" ${disable_fire_data_scientist}>Fire (${financial(data_scientist_hourly_cost * 50)})</button>
    `;
    let disable_fire_moderator = team.moderator == 0 ? "disabled" : "";
    document.getElementById("moderatorCost").innerHTML = `${financial(team.moderator * moderator_hourly_cost * hours_in_tick)} per ${tickName()}`;
    document.getElementById("moderatorButtons").innerHTML = `
        <button onClick="actionHandler('hireModerator')">Hire for ${financial(moderator_hourly_cost * hours_in_tick)} per ${tickName()} </button>
        <button onClick="actionHandler('fireModerator')" ${disable_fire_moderator}>Fire (${financial(moderator_hourly_cost * 50)})</button>
    `;
    let disable_fire_eng = team.engineer == 0 ? "disabled" : "";
    document.getElementById("engineerCost").innerHTML = `${financial(team.engineer * engineer_hourly_cost * hours_in_tick)} per ${tickName()}`;
    document.getElementById("engineerButtons").innerHTML = `
        <button onClick="actionHandler('hireEngineer')">Hire for ${financial(engineer_hourly_cost * hours_in_tick)} per ${tickName()} </button>
        <button onClick="actionHandler('fireEngineer')" ${disable_fire_eng}>Fire (${financial(engineer_hourly_cost * 50)})</button>
    `;

    /// raise financing button
    if (hour_tick < canRaiseNextOnHourTick) {
        document.getElementById("requestFinancingButton").disabled = true;
    } else {
        document.getElementById("requestFinancingButton").disabled = '';
    }

    // loans
    let to_set_for_loans = '';
    if (Object.keys(outstanding_loans).length >= 1) {
        to_set_for_loans = `<h2>Loans</h2>`;
        for (let key in outstanding_loans) {
            //TODO: make Days correct to Day if singular
            to_set_for_loans += `<div>${financial(outstanding_loans[key])} due in ${Math.round((key - hour_tick)/24)} Days and ${Math.round((key - hour_tick) % 24)} Hours`
        }
    }
    document.getElementById("Loans").innerHTML = to_set_for_loans;

    // ad level buttons
    let disable_increase_ad_level = ad_level == 100 ? "disabled" : "";
    let disable_decrease_ad_level = ad_level == 0 ? "disabled" : "";
    document.getElementById("adLevelButtons").innerHTML = `
        <button onClick="actionHandler('increaseAdLevel')" ${disable_increase_ad_level}>Increase</button>
        <button onClick="actionHandler('decreaseAdLevel')" ${disable_decrease_ad_level}>Decrease</button>
    `;

    // marketing spend buttons
    let disable_decrease_marketing_spend = marketing_spend == 0 ? "disabled" : "";
    document.getElementById('marketingSpend').innerHTML = `${financial(marketing_spend * hours_in_tick)} per ${tickName()}`;
    document.getElementById("marketingSpendButtons").innerHTML = `
        <button onClick="actionHandler('increaseMarketingSpend')">Increase to ${financial(calculateIncreaseMarketingSpend() * hours_in_tick)}</button>
        <button onClick="actionHandler('decreaseMarketingSpend')" ${disable_decrease_marketing_spend}>Decrease to ${financial(calculateDecreaseMarketingSpend()  * hours_in_tick)}</button>
    `;

    // debug section
    document.getElementById("ev_organic_growth").innerHTML = organicGrowth()[1];
    document.getElementById("ev_churn").innerHTML = churn()[1];
    document.getElementById("ev_revenue").innerHTML = getAdRevenueInTimestep();
    document.getElementById("ev_marketing_growth").innerHTML = marketingGrowthInTimestep()[1];
    // downtime

    // TODO: move the gameoutputcontainer stuff from the timestep function to here
    if (is_down) {
        document.getElementById("gameOutputContainer").innerHTML = "The website is down! You must hire at least one engineer for every 50,000 users.";
    }
}

function advanceTime () {
    hour_tick += hours_in_tick;
}

function calculateIncreaseMarketingSpend () {
    if (Math.round(marketing_spend) === 0) {
        return 1;
    } else {
        return marketing_spend * 1.5;
    }
}

function calculateDecreaseMarketingSpend () {
    if (Math.round(marketing_spend) === 1) {
        return 0;
    } else {
        return marketing_spend * 0.6666666666666;
    }
}

function calculateOrganicGrowthProbability () {
    // return the probability of a given user referring another user in this very tick

    // first, calculate the annualized expected number of referred users.
    // sentiment 100 : 3.0, 90: 2.43, 80: 1.92, 70: 1.47, 60: 1.08, below that 1.0
    let annual_virality_ev = Math.max(1.0, (calculateSentiment() **2) / 3333);
    // make it slightly less effective so that at 100m users it levels out at 1.5
    annual_virality_ev = annual_virality_ev / (1+(Math.min(users,100000000)/100000000))
    // TODO remove or include jitter? annual_virality_ev = annual_virality_ev * jitter(0.75, 1.25);

    // the above is annualized so we need to make it tick-sized
    // same math as in calculateChurnProbability
    return annual_virality_ev / ticksInYear();
}

function organicGrowth () {
    // return actual value, and expected value
    return [binomial(Math.round(users), calculateOrganicGrowthProbability()), Math.round(users) * calculateOrganicGrowthProbability()];
}

// USER ACTIONS

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

function requestFinancing () {
    // multiple scales with base-10 log of user count to reflect shrinking multiples at scale
    // examples of users: multiples :: 100 : 25, 1000: 23, 100K: 18, 10M: 13.8, 1B: 9.3
    const user_multiple = 30 - Math.log(users)
    // examples of sentiment: multiples :: 100 : 10, 95: 8.1, 90: 6.4, 80: 3.6, 70: 1.0
    const sentiment_multiple = (((calculateSentiment() *- 50)/5)^2) / 10
    // adjust multiple up or down in the random interval of [-25%, +25%]
    const random_multiple_adjustment = 0.75 + (Math.random() / 2)
    const multiple =  Math.max(user_multiple, 1) * Math.max(sentiment_multiple, 1) * random_multiple_adjustment;
    // add some random cash for the early game
    // second parameter: dilution, always in [0.1, 0.3] interval
    const dilution = jitter(0.1, 0.3)
    financingOffer = [(multiple * users) + (Math.random() * 10000), dilution]
    canRaiseNextOnHourTick = hour_tick + (24 * 30 * 9);
};

function acceptFinancing () {
    changesForTick.money += financingOffer[0];
    ownership = ownership * (1 - financingOffer[1]);
    financingOffer = null;
}

function declineFinancing () {
    financingOffer = null;
}

function acceptLoan () {
    changesForTick.money += loan_offer[0];
    outstanding_loans[loan_offer[2]] = [loan_offer[1]]
    loan_offer = null;
}

function declineLoan () {
    loan_offer = null;
}

function increaseAdLevel () {
    ad_level += 10;
}

function decreaseAdLevel () {
    ad_level -= 10;
}

function increaseMarketingSpend () {
    marketing_spend = calculateIncreaseMarketingSpend();
}

function decreaseMarketingSpend () {
    marketing_spend = calculateDecreaseMarketingSpend();
}

function hireModerator () {
    team.moderator += 1;
}

function fireModerator () {
    team.moderator -= 1;
    changesForTick.money -= moderator_hourly_cost * 50;
}

function hireDatascientist () {
    team.data_scientist += 1;
}

function fireDatascientist () {
    team.data_scientist -= 1;
    changesForTick.money -= data_scientist_hourly_cost * 50;
}

function hireEngineer () {
    team.engineer += 1;
    if (users / team.engineer < 50000) {
        is_down = false;
    }
}

function fireEngineer () {
    team.data_scientist -= 1;
    changesForTick.money -= engineer_hourly_cost * 50;
}

window.actionHandler = (action) => {
    let output = '';
    let input = '';

    if (action === "tellYourFriends") {
        tellYourFriends();
    } else if (action === "requestFinancing") {
        requestFinancing();
        output = `You have been offered ${financial(financingOffer[0])} for ${percentage(financingOffer[1])} of the company. Do you accept?`
        input = `<button onClick="actionHandler('acceptFinancing')">Accept</button><button onClick="actionHandler('declineFinancing')">Decline</button>`
    } else if (action === "acceptFinancing") {
        // todo: replace all of this with a dict of action : function to make it a little easier
        acceptFinancing();
    } else if (action === "declineFinancing") {
        declineFinancing();
    } else if (action === "increaseAdLevel") {
        increaseAdLevel();
    } else if (action === "decreaseAdLevel") {
        decreaseAdLevel();
    } else if (action === "hireModerator") {
        hireModerator();
    } else if (action === "fireModerator") {
        fireModerator();
    } else if (action === "hireEngineer") {
        hireEngineer();
    } else if (action === "fireEngineer") {
        fireEngineer();
    } else if (action === "increaseMarketingSpend") {
        increaseMarketingSpend();
    } else if (action === "decreaseMarketingSpend") {
        decreaseMarketingSpend();
    } else if (action === "fastForward1Day") {
        // this should never happen
        if (hours_in_tick >= 24) {
            return;
        }
        // technically unnecessary
        let number_of_ticks = 24 / hours_in_tick
        for (let i=0; i < number_of_ticks; i++) {
            timeStepActions();
        }
    } else if (action === "fastForward1Week") {
        // this should never happen
        if (hours_in_tick >= 168) {
            return;
        }
        let number_of_ticks = 168 / hours_in_tick
        for (let i=0; i < number_of_ticks; i++) {
            timeStepActions();
        }
    } else if (action === "hireDataScientist") {
        hireDatascientist();
    } else if (action === "fireDataScientist") {
        fireDatascientist();
    } else if (action === "requestLoan") {
        let ev_annual_revenue = getAdRevenueInTimestep() * ticksInYear();
        // loans are slightly overpowered since if you optimally invest the loan into ads, the payback is about 1y and they're profitable afterwards
        // ^ given above comment, put the loan amount at ev_annual_rev/2
        let annual_interest = 0.15 * (2**Object.keys(outstanding_loans).length)
        // amount offered, amount requested back, timestep due]
        loan_offer = [ev_annual_revenue/2, ev_annual_revenue/2 * (1+annual_interest), hour_tick + 8760];

        output = `You have been offered ${financial(loan_offer[0])} at ${percentage(annual_interest)} interest due in one year. Do you accept?`
        input = `<button onClick="actionHandler('acceptLoan')">Accept</button><button onClick="actionHandler('declineLoan')">Decline</button>`
    } else if (action === 'acceptLoan') {
        acceptLoan();
    } else if (action === 'declineLoan') {
        declineLoan();
    } else {
        console.log(`UNRECOGNIZED ACTION ${action}`);
    }

    document.getElementById("gameOutputContainer").innerHTML = output;
    document.getElementById("gameInputContainer").innerHTML = input;
    paintInterface();
}

paintInterface();

function checkForLoans () {
    for (let key in outstanding_loans) {
        if (key <= hour_tick) {
            changesForTick.money -= outstanding_loans[key];
            delete outstanding_loans[key]
        }
    }
}

function checkForDowntime () {
    // if it's already down and nobody's been hired, then it remains down
    if (is_down) {
        return;
    }
    is_down = users > 50000 && (team.engineer === 0 || users / team.engineer > 50000);
}

function timeStepActions () {
    advanceTime();
    checkForDowntime();
    // TODO: put these into the organicGrowth/churn/etc functions
    if (!is_down) {
        // during downtime, no user growth, no revenue
        changesForTick.users += organicGrowth()[0];
        changesForTick.money += getAdRevenueInTimestep();
    }
    if (is_down) {
        // penalty: lose 10% a week => 2.5% a day => 0.1% per hour
        changesForTick.users -= users * (0.001 * hours_in_tick);
    }
     changesForTick.users -= churn()[0];
    changesForTick.users += marketingGrowthInTimestep()[0];
    changesForTick.money -= marketingSpendInTimestep();
    changesForTick.money -= teamSpendInTimestep();
    checkForLoans();
    money += changesForTick.money;
    users += changesForTick.users;
    changesForTick = {
        money: 0,
        users: 0
    };

    // avoid this degenerate case
    users = Math.max(1, users)
}

function gameLoop () {
    // 1 second per tick game loop
    setTimeout(() => {
        timeStepActions();
        paintInterface();
        gameLoop();
    }, 1000);
}

gameLoop();