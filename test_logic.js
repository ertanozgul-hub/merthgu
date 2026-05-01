const orders = [
    { id: 1, completedStages: [false, false, false, false] },
    { id: 2, completedStages: [true, false, false, false] },
    { id: 3, completedStages: [true, true, false, false] },
    { id: 4, completedStages: [true, true, true, false] },
    { id: 5, completedStages: [true, true, true, true] },
    { id: 6, completedStages: [false, true, false, false] }, // User skipped 0
];

orders.forEach(o => {
    let targetIndex = 0;
    if (o.completedStages && o.completedStages.length > 0) {
        let lastCompleted = -1;
        for (let i = 0; i < o.completedStages.length; i++) {
            if (o.completedStages[i]) lastCompleted = i;
        }
        targetIndex = lastCompleted + 1;
        if (targetIndex > 3) targetIndex = 3;
    }
    const stages = ['Tasarım', 'Kaynak', 'Boya', 'Montaj'];
    console.log(`Order ${o.id}: Last completed: ${o.completedStages.lastIndexOf(true)} -> Target Stage: ${stages[targetIndex]}`);
});
