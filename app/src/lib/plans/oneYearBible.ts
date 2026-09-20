// One-Year Bible Reading Plan — four parallel tracks, 365 days.
//
// GENERATED from One_Year_Bible_Plan.pdf ("One-Year Bible Reading Plan — Ends
// All Books on Dec 31") by parsing the PDF text; not hand-typed. Do not edit
// rows by hand — test/scheduledPlans.test.ts pins the invariants (365 days,
// every reading a real chapter, all 1,189 chapters of the Bible covered).
//
// Tracks (the PDF's four columns) are derivable from the book, so they are
// not stored: OT History/Pentateuch (Genesis–Esther), OT Prophets/Writings
// (Job, Ecclesiastes, Song of Solomon, Isaiah–Malachi), New Testament, and
// Psalm/Proverb. Psalms cycle ~2.5x, Proverbs and the Gospels/Romans 2x —
// which is why completion is tracked per DAY, not per (book, chapter).

/** Day N (1-based) is index N-1. Each entry is "<Book> <chapter>". */
export const ONE_YEAR_BIBLE_DAYS: readonly (readonly string[])[] = [
  ['Genesis 1', 'Genesis 2', 'Job 1', 'Matthew 1', 'Psalms 1'], // 1
  ['Genesis 3', 'Genesis 4', 'Job 2', 'Matthew 2', 'Psalms 2'], // 2
  ['Genesis 5', 'Genesis 6', 'Job 3', 'Matthew 3', 'Psalms 3'], // 3
  ['Genesis 7', 'Genesis 8', 'Job 4', 'Matthew 4', 'Psalms 4'], // 4
  ['Genesis 9', 'Genesis 10', 'Job 5', 'Matthew 5', 'Psalms 5'], // 5
  ['Genesis 11', 'Genesis 12', 'Job 6', 'Matthew 6', 'Psalms 6'], // 6
  ['Genesis 13', 'Genesis 14', 'Job 7', 'Matthew 7', 'Psalms 7'], // 7
  ['Genesis 15', 'Genesis 16', 'Job 8', 'Matthew 8', 'Psalms 8'], // 8
  ['Genesis 17', 'Genesis 18', 'Job 9', 'Matthew 9', 'Psalms 9'], // 9
  ['Genesis 19', 'Genesis 20', 'Job 10', 'Matthew 10', 'Psalms 10'], // 10
  ['Genesis 21', 'Genesis 22', 'Job 11', 'Matthew 11', 'Psalms 11'], // 11
  ['Genesis 23', 'Genesis 24', 'Job 12', 'Matthew 12', 'Psalms 12'], // 12
  ['Genesis 25', 'Genesis 26', 'Job 13', 'Matthew 13', 'Psalms 13'], // 13
  ['Genesis 27', 'Genesis 28', 'Job 14', 'Matthew 14', 'Psalms 14'], // 14
  ['Genesis 29', 'Genesis 30', 'Job 15', 'Matthew 15', 'Psalms 15'], // 15
  ['Genesis 31', 'Genesis 32', 'Job 16', 'Matthew 16', 'Psalms 16'], // 16
  ['Genesis 33', 'Genesis 34', 'Job 17', 'Matthew 17', 'Psalms 17'], // 17
  ['Genesis 35', 'Genesis 36', 'Job 18', 'Matthew 18', 'Psalms 18'], // 18
  ['Genesis 37', 'Genesis 38', 'Job 19', 'Matthew 19', 'Psalms 19'], // 19
  ['Genesis 39', 'Genesis 40', 'Job 20', 'Matthew 20', 'Psalms 20'], // 20
  ['Genesis 41', 'Genesis 42', 'Job 21', 'Matthew 21', 'Psalms 21'], // 21
  ['Genesis 43', 'Genesis 44', 'Job 22', 'Matthew 22', 'Psalms 22'], // 22
  ['Genesis 45', 'Genesis 46', 'Job 23', 'Matthew 23', 'Psalms 23'], // 23
  ['Genesis 47', 'Genesis 48', 'Job 24', 'Matthew 24', 'Psalms 24'], // 24
  ['Genesis 49', 'Genesis 50', 'Job 25', 'Matthew 25', 'Psalms 25'], // 25
  ['Exodus 1', 'Exodus 2', 'Job 26', 'Matthew 26', 'Psalms 26'], // 26
  ['Exodus 3', 'Exodus 4', 'Job 27', 'Matthew 27', 'Psalms 27'], // 27
  ['Exodus 5', 'Exodus 6', 'Job 28', 'Matthew 28', 'Psalms 28'], // 28
  ['Exodus 7', 'Exodus 8', 'Job 29', 'Mark 1', 'Psalms 29'], // 29
  ['Exodus 9', 'Exodus 10', 'Job 30', 'Mark 2', 'Psalms 30'], // 30
  ['Exodus 11', 'Exodus 12', 'Job 31', 'Mark 3', 'Psalms 31'], // 31
  ['Exodus 13', 'Exodus 14', 'Job 32', 'Mark 4', 'Psalms 32'], // 32
  ['Exodus 15', 'Exodus 16', 'Job 33', 'Mark 5', 'Psalms 33'], // 33
  ['Exodus 17', 'Exodus 18', 'Job 34', 'Mark 6', 'Psalms 34'], // 34
  ['Exodus 19', 'Exodus 20', 'Job 35', 'Mark 7', 'Psalms 35'], // 35
  ['Exodus 21', 'Exodus 22', 'Job 36', 'Mark 8', 'Psalms 36'], // 36
  ['Exodus 23', 'Exodus 24', 'Job 37', 'Mark 9', 'Psalms 37'], // 37
  ['Exodus 25', 'Exodus 26', 'Job 38', 'Mark 10', 'Psalms 38'], // 38
  ['Exodus 27', 'Exodus 28', 'Job 39', 'Mark 11', 'Psalms 39'], // 39
  ['Exodus 29', 'Exodus 30', 'Job 40', 'Mark 12', 'Psalms 40'], // 40
  ['Exodus 31', 'Exodus 32', 'Job 41', 'Mark 13', 'Psalms 41'], // 41
  ['Exodus 33', 'Exodus 34', 'Job 42', 'Mark 14', 'Psalms 42'], // 42
  ['Exodus 35', 'Exodus 36', 'Ecclesiastes 1', 'Mark 15', 'Psalms 43'], // 43
  ['Exodus 37', 'Exodus 38', 'Ecclesiastes 2', 'Mark 16', 'Psalms 44'], // 44
  ['Exodus 39', 'Exodus 40', 'Ecclesiastes 3', 'Luke 1', 'Psalms 45'], // 45
  ['Leviticus 1', 'Leviticus 2', 'Ecclesiastes 4', 'Luke 2', 'Psalms 46'], // 46
  ['Leviticus 3', 'Leviticus 4', 'Ecclesiastes 5', 'Luke 3', 'Psalms 47'], // 47
  ['Leviticus 5', 'Leviticus 6', 'Ecclesiastes 6', 'Luke 4', 'Psalms 48'], // 48
  ['Leviticus 7', 'Leviticus 8', 'Ecclesiastes 7', 'Luke 5', 'Psalms 49'], // 49
  ['Leviticus 9', 'Leviticus 10', 'Ecclesiastes 8', 'Luke 6', 'Psalms 50'], // 50
  ['Leviticus 11', 'Leviticus 12', 'Ecclesiastes 9', 'Luke 7', 'Psalms 51'], // 51
  ['Leviticus 13', 'Leviticus 14', 'Ecclesiastes 10', 'Luke 8', 'Psalms 52'], // 52
  ['Leviticus 15', 'Leviticus 16', 'Ecclesiastes 11', 'Luke 9', 'Psalms 53'], // 53
  ['Leviticus 17', 'Leviticus 18', 'Ecclesiastes 12', 'Luke 10', 'Psalms 54'], // 54
  ['Leviticus 19', 'Leviticus 20', 'Song of Solomon 1', 'Luke 11', 'Psalms 55'], // 55
  ['Leviticus 21', 'Leviticus 22', 'Song of Solomon 2', 'Luke 12', 'Psalms 56'], // 56
  ['Leviticus 23', 'Leviticus 24', 'Song of Solomon 3', 'Luke 13', 'Psalms 57'], // 57
  ['Leviticus 25', 'Leviticus 26', 'Song of Solomon 4', 'Luke 14', 'Psalms 58'], // 58
  ['Leviticus 27', 'Numbers 1', 'Song of Solomon 5', 'Luke 15', 'Psalms 59'], // 59
  ['Numbers 2', 'Numbers 3', 'Song of Solomon 6', 'Luke 16', 'Psalms 60'], // 60
  ['Numbers 4', 'Numbers 5', 'Song of Solomon 7', 'Luke 17', 'Psalms 61'], // 61
  ['Numbers 6', 'Numbers 7', 'Song of Solomon 8', 'Luke 18', 'Psalms 62'], // 62
  ['Numbers 8', 'Numbers 9', 'Isaiah 1', 'Luke 19', 'Psalms 63'], // 63
  ['Numbers 10', 'Numbers 11', 'Isaiah 2', 'Luke 20', 'Psalms 64'], // 64
  ['Numbers 12', 'Numbers 13', 'Isaiah 3', 'Luke 21', 'Psalms 65'], // 65
  ['Numbers 14', 'Numbers 15', 'Isaiah 4', 'Luke 22', 'Psalms 66'], // 66
  ['Numbers 16', 'Numbers 17', 'Isaiah 5', 'Luke 23', 'Psalms 67'], // 67
  ['Numbers 18', 'Numbers 19', 'Isaiah 6', 'Luke 24', 'Psalms 68'], // 68
  ['Numbers 20', 'Numbers 21', 'Isaiah 7', 'John 1', 'Psalms 69'], // 69
  ['Numbers 22', 'Numbers 23', 'Isaiah 8', 'John 2', 'Psalms 70'], // 70
  ['Numbers 24', 'Numbers 25', 'Isaiah 9', 'John 3', 'Psalms 71'], // 71
  ['Numbers 26', 'Isaiah 10', 'John 4', 'Psalms 72'], // 72
  ['Numbers 27', 'Isaiah 11', 'John 5', 'Psalms 73'], // 73
  ['Numbers 28', 'Isaiah 12', 'John 6', 'Psalms 74'], // 74
  ['Numbers 29', 'Isaiah 13', 'John 7', 'Psalms 75'], // 75
  ['Numbers 30', 'Isaiah 14', 'John 8', 'Psalms 76'], // 76
  ['Numbers 31', 'Isaiah 15', 'John 9', 'Psalms 77'], // 77
  ['Numbers 32', 'Isaiah 16', 'John 10', 'Psalms 78'], // 78
  ['Numbers 33', 'Isaiah 17', 'John 11', 'Psalms 79'], // 79
  ['Numbers 34', 'Isaiah 18', 'John 12', 'Psalms 80'], // 80
  ['Numbers 35', 'Isaiah 19', 'John 13', 'Psalms 81'], // 81
  ['Numbers 36', 'Isaiah 20', 'John 14', 'Psalms 82'], // 82
  ['Deuteronomy 1', 'Isaiah 21', 'John 15', 'Psalms 83'], // 83
  ['Deuteronomy 2', 'Isaiah 22', 'John 16', 'Psalms 84'], // 84
  ['Deuteronomy 3', 'Isaiah 23', 'John 17', 'Psalms 85'], // 85
  ['Deuteronomy 4', 'Isaiah 24', 'John 18', 'Psalms 86'], // 86
  ['Deuteronomy 5', 'Isaiah 25', 'John 19', 'Psalms 87'], // 87
  ['Deuteronomy 6', 'Isaiah 26', 'John 20', 'Psalms 88'], // 88
  ['Deuteronomy 7', 'Isaiah 27', 'John 21', 'Psalms 89'], // 89
  ['Deuteronomy 8', 'Isaiah 28', 'Acts 1', 'Psalms 90'], // 90
  ['Deuteronomy 9', 'Isaiah 29', 'Acts 2', 'Psalms 91'], // 91
  ['Deuteronomy 10', 'Isaiah 30', 'Acts 3', 'Psalms 92'], // 92
  ['Deuteronomy 11', 'Isaiah 31', 'Acts 4', 'Psalms 93'], // 93
  ['Deuteronomy 12', 'Isaiah 32', 'Acts 5', 'Psalms 94'], // 94
  ['Deuteronomy 13', 'Isaiah 33', 'Acts 6', 'Psalms 95'], // 95
  ['Deuteronomy 14', 'Isaiah 34', 'Acts 7', 'Psalms 96'], // 96
  ['Deuteronomy 15', 'Isaiah 35', 'Acts 8', 'Psalms 97'], // 97
  ['Deuteronomy 16', 'Isaiah 36', 'Acts 9', 'Psalms 98'], // 98
  ['Deuteronomy 17', 'Isaiah 37', 'Acts 10', 'Psalms 99'], // 99
  ['Deuteronomy 18', 'Isaiah 38', 'Acts 11', 'Psalms 100'], // 100
  ['Deuteronomy 19', 'Isaiah 39', 'Acts 12', 'Psalms 101'], // 101
  ['Deuteronomy 20', 'Isaiah 40', 'Acts 13', 'Psalms 102'], // 102
  ['Deuteronomy 21', 'Isaiah 41', 'Acts 14', 'Psalms 103'], // 103
  ['Deuteronomy 22', 'Isaiah 42', 'Acts 15', 'Psalms 104'], // 104
  ['Deuteronomy 23', 'Isaiah 43', 'Acts 16', 'Psalms 105'], // 105
  ['Deuteronomy 24', 'Isaiah 44', 'Acts 17', 'Psalms 106'], // 106
  ['Deuteronomy 25', 'Isaiah 45', 'Acts 18', 'Psalms 107'], // 107
  ['Deuteronomy 26', 'Isaiah 46', 'Acts 19', 'Psalms 108'], // 108
  ['Deuteronomy 27', 'Isaiah 47', 'Acts 20', 'Psalms 109'], // 109
  ['Deuteronomy 28', 'Isaiah 48', 'Acts 21', 'Psalms 110'], // 110
  ['Deuteronomy 29', 'Isaiah 49', 'Acts 22', 'Psalms 111'], // 111
  ['Deuteronomy 30', 'Isaiah 50', 'Acts 23', 'Psalms 112'], // 112
  ['Deuteronomy 31', 'Isaiah 51', 'Acts 24', 'Psalms 113'], // 113
  ['Deuteronomy 32', 'Isaiah 52', 'Acts 25', 'Psalms 114'], // 114
  ['Deuteronomy 33', 'Isaiah 53', 'Acts 26', 'Psalms 115'], // 115
  ['Deuteronomy 34', 'Isaiah 54', 'Acts 27', 'Psalms 116'], // 116
  ['Joshua 1', 'Isaiah 55', 'Acts 28', 'Psalms 117'], // 117
  ['Joshua 2', 'Isaiah 56', 'Romans 1', 'Psalms 118'], // 118
  ['Joshua 3', 'Isaiah 57', 'Romans 2', 'Psalms 119'], // 119
  ['Joshua 4', 'Isaiah 58', 'Romans 3', 'Psalms 120'], // 120
  ['Joshua 5', 'Isaiah 59', 'Romans 4', 'Psalms 121'], // 121
  ['Joshua 6', 'Isaiah 60', 'Romans 5', 'Psalms 122'], // 122
  ['Joshua 7', 'Isaiah 61', 'Romans 6', 'Psalms 123'], // 123
  ['Joshua 8', 'Isaiah 62', 'Romans 7', 'Psalms 124'], // 124
  ['Joshua 9', 'Isaiah 63', 'Romans 8', 'Psalms 125'], // 125
  ['Joshua 10', 'Isaiah 64', 'Romans 9', 'Psalms 126'], // 126
  ['Joshua 11', 'Isaiah 65', 'Romans 10', 'Psalms 127'], // 127
  ['Joshua 12', 'Isaiah 66', 'Romans 11', 'Psalms 128'], // 128
  ['Joshua 13', 'Jeremiah 1', 'Romans 12', 'Psalms 129'], // 129
  ['Joshua 14', 'Jeremiah 2', 'Romans 13', 'Psalms 130'], // 130
  ['Joshua 15', 'Jeremiah 3', 'Romans 14', 'Psalms 131'], // 131
  ['Joshua 16', 'Jeremiah 4', 'Romans 15', 'Psalms 132'], // 132
  ['Joshua 17', 'Jeremiah 5', 'Romans 16', 'Psalms 133'], // 133
  ['Joshua 18', 'Jeremiah 6', '1 Corinthians 1', 'Psalms 134'], // 134
  ['Joshua 19', 'Jeremiah 7', '1 Corinthians 2', 'Psalms 135'], // 135
  ['Joshua 20', 'Jeremiah 8', '1 Corinthians 3', 'Psalms 136'], // 136
  ['Joshua 21', 'Jeremiah 9', '1 Corinthians 4', 'Psalms 137'], // 137
  ['Joshua 22', 'Jeremiah 10', '1 Corinthians 5', 'Psalms 138'], // 138
  ['Joshua 23', 'Jeremiah 11', '1 Corinthians 6', 'Psalms 139'], // 139
  ['Joshua 24', 'Jeremiah 12', '1 Corinthians 7', 'Psalms 140'], // 140
  ['Judges 1', 'Jeremiah 13', '1 Corinthians 8', 'Psalms 141'], // 141
  ['Judges 2', 'Jeremiah 14', '1 Corinthians 9', 'Psalms 142'], // 142
  ['Judges 3', 'Jeremiah 15', '1 Corinthians 10', 'Psalms 143'], // 143
  ['Judges 4', 'Jeremiah 16', '1 Corinthians 11', 'Psalms 144'], // 144
  ['Judges 5', 'Jeremiah 17', '1 Corinthians 12', 'Psalms 145'], // 145
  ['Judges 6', 'Jeremiah 18', '1 Corinthians 13', 'Psalms 146'], // 146
  ['Judges 7', 'Jeremiah 19', '1 Corinthians 14', 'Psalms 147'], // 147
  ['Judges 8', 'Jeremiah 20', '1 Corinthians 15', 'Psalms 148'], // 148
  ['Judges 9', 'Jeremiah 21', '1 Corinthians 16', 'Psalms 149'], // 149
  ['Judges 10', 'Jeremiah 22', '2 Corinthians 1', 'Psalms 150'], // 150
  ['Judges 11', 'Jeremiah 23', '2 Corinthians 2', 'Proverbs 1'], // 151
  ['Judges 12', 'Jeremiah 24', '2 Corinthians 3', 'Proverbs 2'], // 152
  ['Judges 13', 'Jeremiah 25', '2 Corinthians 4', 'Proverbs 3'], // 153
  ['Judges 14', 'Jeremiah 26', '2 Corinthians 5', 'Proverbs 4'], // 154
  ['Judges 15', 'Jeremiah 27', '2 Corinthians 6', 'Proverbs 5'], // 155
  ['Judges 16', 'Jeremiah 28', '2 Corinthians 7', 'Proverbs 6'], // 156
  ['Judges 17', 'Jeremiah 29', '2 Corinthians 8', 'Proverbs 7'], // 157
  ['Judges 18', 'Jeremiah 30', '2 Corinthians 9', 'Proverbs 8'], // 158
  ['Judges 19', 'Jeremiah 31', '2 Corinthians 10', 'Proverbs 9'], // 159
  ['Judges 20', 'Jeremiah 32', '2 Corinthians 11', 'Proverbs 10'], // 160
  ['Judges 21', 'Jeremiah 33', '2 Corinthians 12', 'Proverbs 11'], // 161
  ['Ruth 1', 'Jeremiah 34', '2 Corinthians 13', 'Proverbs 12'], // 162
  ['Ruth 2', 'Jeremiah 35', 'Galatians 1', 'Proverbs 13'], // 163
  ['Ruth 3', 'Jeremiah 36', 'Galatians 2', 'Proverbs 14'], // 164
  ['Ruth 4', 'Jeremiah 37', 'Galatians 3', 'Proverbs 15'], // 165
  ['1 Samuel 1', 'Jeremiah 38', 'Galatians 4', 'Proverbs 16'], // 166
  ['1 Samuel 2', 'Jeremiah 39', 'Galatians 5', 'Proverbs 17'], // 167
  ['1 Samuel 3', 'Jeremiah 40', 'Galatians 6', 'Proverbs 18'], // 168
  ['1 Samuel 4', 'Jeremiah 41', 'Ephesians 1', 'Proverbs 19'], // 169
  ['1 Samuel 5', 'Jeremiah 42', 'Ephesians 2', 'Proverbs 20'], // 170
  ['1 Samuel 6', 'Jeremiah 43', 'Ephesians 3', 'Proverbs 21'], // 171
  ['1 Samuel 7', 'Jeremiah 44', 'Ephesians 4', 'Proverbs 22'], // 172
  ['1 Samuel 8', 'Jeremiah 45', 'Ephesians 5', 'Proverbs 23'], // 173
  ['1 Samuel 9', 'Jeremiah 46', 'Ephesians 6', 'Proverbs 24'], // 174
  ['1 Samuel 10', 'Jeremiah 47', 'Philippians 1', 'Proverbs 25'], // 175
  ['1 Samuel 11', 'Jeremiah 48', 'Philippians 2', 'Proverbs 26'], // 176
  ['1 Samuel 12', 'Jeremiah 49', 'Philippians 3', 'Proverbs 27'], // 177
  ['1 Samuel 13', 'Jeremiah 50', 'Philippians 4', 'Proverbs 28'], // 178
  ['1 Samuel 14', 'Jeremiah 51', 'Colossians 1', 'Proverbs 29'], // 179
  ['1 Samuel 15', 'Jeremiah 52', 'Colossians 2', 'Proverbs 30'], // 180
  ['1 Samuel 16', 'Lamentations 1', 'Colossians 3', 'Proverbs 31'], // 181
  ['1 Samuel 17', 'Lamentations 2', 'Colossians 4', 'Psalms 1'], // 182
  ['1 Samuel 18', 'Lamentations 3', '1 Thessalonians 1', 'Psalms 2'], // 183
  ['1 Samuel 19', 'Lamentations 4', '1 Thessalonians 2', 'Psalms 3'], // 184
  ['1 Samuel 20', 'Lamentations 5', '1 Thessalonians 3', 'Psalms 4'], // 185
  ['1 Samuel 21', 'Ezekiel 1', '1 Thessalonians 4', 'Psalms 5'], // 186
  ['1 Samuel 22', 'Ezekiel 2', '1 Thessalonians 5', 'Psalms 6'], // 187
  ['1 Samuel 23', 'Ezekiel 3', '2 Thessalonians 1', 'Psalms 7'], // 188
  ['1 Samuel 24', 'Ezekiel 4', '2 Thessalonians 2', 'Psalms 8'], // 189
  ['1 Samuel 25', 'Ezekiel 5', '2 Thessalonians 3', 'Psalms 9'], // 190
  ['1 Samuel 26', 'Ezekiel 6', '1 Timothy 1', 'Psalms 10'], // 191
  ['1 Samuel 27', 'Ezekiel 7', '1 Timothy 2', 'Psalms 11'], // 192
  ['1 Samuel 28', 'Ezekiel 8', '1 Timothy 3', 'Psalms 12'], // 193
  ['1 Samuel 29', 'Ezekiel 9', '1 Timothy 4', 'Psalms 13'], // 194
  ['1 Samuel 30', 'Ezekiel 10', '1 Timothy 5', 'Psalms 14'], // 195
  ['1 Samuel 31', 'Ezekiel 11', '1 Timothy 6', 'Psalms 15'], // 196
  ['2 Samuel 1', 'Ezekiel 12', '2 Timothy 1', 'Psalms 16'], // 197
  ['2 Samuel 2', 'Ezekiel 13', '2 Timothy 2', 'Psalms 17'], // 198
  ['2 Samuel 3', 'Ezekiel 14', '2 Timothy 3', 'Psalms 18'], // 199
  ['2 Samuel 4', 'Ezekiel 15', '2 Timothy 4', 'Psalms 19'], // 200
  ['2 Samuel 5', 'Ezekiel 16', 'Titus 1', 'Psalms 20'], // 201
  ['2 Samuel 6', 'Ezekiel 17', 'Titus 2', 'Psalms 21'], // 202
  ['2 Samuel 7', 'Ezekiel 18', 'Titus 3', 'Psalms 22'], // 203
  ['2 Samuel 8', 'Ezekiel 19', 'Philemon 1', 'Psalms 23'], // 204
  ['2 Samuel 9', 'Ezekiel 20', 'Hebrews 1', 'Psalms 24'], // 205
  ['2 Samuel 10', 'Ezekiel 21', 'Hebrews 2', 'Psalms 25'], // 206
  ['2 Samuel 11', 'Ezekiel 22', 'Hebrews 3', 'Psalms 26'], // 207
  ['2 Samuel 12', 'Ezekiel 23', 'Hebrews 4', 'Psalms 27'], // 208
  ['2 Samuel 13', 'Ezekiel 24', 'Hebrews 5', 'Psalms 28'], // 209
  ['2 Samuel 14', 'Ezekiel 25', 'Hebrews 6', 'Psalms 29'], // 210
  ['2 Samuel 15', 'Ezekiel 26', 'Hebrews 7', 'Psalms 30'], // 211
  ['2 Samuel 16', 'Ezekiel 27', 'Hebrews 8', 'Psalms 31'], // 212
  ['2 Samuel 17', 'Ezekiel 28', 'Hebrews 9', 'Psalms 32'], // 213
  ['2 Samuel 18', 'Ezekiel 29', 'Hebrews 10', 'Psalms 33'], // 214
  ['2 Samuel 19', 'Ezekiel 30', 'Hebrews 11', 'Psalms 34'], // 215
  ['2 Samuel 20', 'Ezekiel 31', 'Hebrews 12', 'Psalms 35'], // 216
  ['2 Samuel 21', 'Ezekiel 32', 'Hebrews 13', 'Psalms 36'], // 217
  ['2 Samuel 22', 'Ezekiel 33', 'James 1', 'Psalms 37'], // 218
  ['2 Samuel 23', 'Ezekiel 34', 'James 2', 'Psalms 38'], // 219
  ['2 Samuel 24', 'Ezekiel 35', 'James 3', 'Psalms 39'], // 220
  ['1 Kings 1', 'Ezekiel 36', 'James 4', 'Psalms 40'], // 221
  ['1 Kings 2', 'Ezekiel 37', 'James 5', 'Psalms 41'], // 222
  ['1 Kings 3', 'Ezekiel 38', '1 Peter 1', 'Psalms 42'], // 223
  ['1 Kings 4', 'Ezekiel 39', '1 Peter 2', 'Psalms 43'], // 224
  ['1 Kings 5', 'Ezekiel 40', '1 Peter 3', 'Psalms 44'], // 225
  ['1 Kings 6', 'Ezekiel 41', '1 Peter 4', 'Psalms 45'], // 226
  ['1 Kings 7', 'Ezekiel 42', '1 Peter 5', 'Psalms 46'], // 227
  ['1 Kings 8', 'Ezekiel 43', '2 Peter 1', 'Psalms 47'], // 228
  ['1 Kings 9', 'Ezekiel 44', '2 Peter 2', 'Psalms 48'], // 229
  ['1 Kings 10', 'Ezekiel 45', '2 Peter 3', 'Psalms 49'], // 230
  ['1 Kings 11', 'Ezekiel 46', '1 John 1', 'Psalms 50'], // 231
  ['1 Kings 12', 'Ezekiel 47', '1 John 2', 'Psalms 51'], // 232
  ['1 Kings 13', 'Ezekiel 48', '1 John 3', 'Psalms 52'], // 233
  ['1 Kings 14', 'Daniel 1', '1 John 4', 'Psalms 53'], // 234
  ['1 Kings 15', 'Daniel 2', '1 John 5', 'Psalms 54'], // 235
  ['1 Kings 16', 'Daniel 3', '2 John 1', 'Psalms 55'], // 236
  ['1 Kings 17', 'Daniel 4', '3 John 1', 'Psalms 56'], // 237
  ['1 Kings 18', 'Daniel 5', 'Jude 1', 'Psalms 57'], // 238
  ['1 Kings 19', 'Daniel 6', 'Revelation 1', 'Psalms 58'], // 239
  ['1 Kings 20', 'Daniel 7', 'Revelation 2', 'Psalms 59'], // 240
  ['1 Kings 21', 'Daniel 8', 'Revelation 3', 'Psalms 60'], // 241
  ['1 Kings 22', 'Daniel 9', 'Revelation 4', 'Psalms 61'], // 242
  ['2 Kings 1', 'Daniel 10', 'Revelation 5', 'Psalms 62'], // 243
  ['2 Kings 2', 'Daniel 11', 'Revelation 6', 'Psalms 63'], // 244
  ['2 Kings 3', 'Daniel 12', 'Revelation 7', 'Psalms 64'], // 245
  ['2 Kings 4', 'Hosea 1', 'Revelation 8', 'Psalms 65'], // 246
  ['2 Kings 5', 'Hosea 2', 'Revelation 9', 'Psalms 66'], // 247
  ['2 Kings 6', 'Hosea 3', 'Revelation 10', 'Psalms 67'], // 248
  ['2 Kings 7', 'Hosea 4', 'Revelation 11', 'Psalms 68'], // 249
  ['2 Kings 8', 'Hosea 5', 'Revelation 12', 'Psalms 69'], // 250
  ['2 Kings 9', 'Hosea 6', 'Revelation 13', 'Psalms 70'], // 251
  ['2 Kings 10', 'Hosea 7', 'Revelation 14', 'Psalms 71'], // 252
  ['2 Kings 11', 'Hosea 8', 'Revelation 15', 'Psalms 72'], // 253
  ['2 Kings 12', 'Hosea 9', 'Revelation 16', 'Psalms 73'], // 254
  ['2 Kings 13', 'Hosea 10', 'Revelation 17', 'Psalms 74'], // 255
  ['2 Kings 14', 'Hosea 11', 'Revelation 18', 'Psalms 75'], // 256
  ['2 Kings 15', 'Hosea 12', 'Revelation 19', 'Psalms 76'], // 257
  ['2 Kings 16', 'Hosea 13', 'Revelation 20', 'Psalms 77'], // 258
  ['2 Kings 17', 'Hosea 14', 'Revelation 21', 'Psalms 78'], // 259
  ['2 Kings 18', 'Joel 1', 'Revelation 22', 'Psalms 79'], // 260
  ['2 Kings 19', 'Joel 2', 'Matthew 1', 'Psalms 80'], // 261
  ['2 Kings 20', 'Joel 3', 'Matthew 2', 'Psalms 81'], // 262
  ['2 Kings 21', 'Amos 1', 'Matthew 3', 'Psalms 82'], // 263
  ['2 Kings 22', 'Amos 2', 'Matthew 4', 'Psalms 83'], // 264
  ['2 Kings 23', 'Amos 3', 'Matthew 5', 'Psalms 84'], // 265
  ['2 Kings 24', 'Amos 4', 'Matthew 6', 'Psalms 85'], // 266
  ['2 Kings 25', 'Amos 5', 'Matthew 7', 'Psalms 86'], // 267
  ['1 Chronicles 1', 'Amos 6', 'Matthew 8', 'Psalms 87'], // 268
  ['1 Chronicles 2', 'Amos 7', 'Matthew 9', 'Psalms 88'], // 269
  ['1 Chronicles 3', 'Amos 8', 'Matthew 10', 'Psalms 89'], // 270
  ['1 Chronicles 4', 'Amos 9', 'Matthew 11', 'Psalms 90'], // 271
  ['1 Chronicles 5', 'Obadiah 1', 'Matthew 12', 'Psalms 91'], // 272
  ['1 Chronicles 6', 'Jonah 1', 'Matthew 13', 'Psalms 92'], // 273
  ['1 Chronicles 7', 'Jonah 2', 'Matthew 14', 'Psalms 93'], // 274
  ['1 Chronicles 8', 'Jonah 3', 'Matthew 15', 'Psalms 94'], // 275
  ['1 Chronicles 9', 'Jonah 4', 'Matthew 16', 'Psalms 95'], // 276
  ['1 Chronicles 10', 'Micah 1', 'Matthew 17', 'Psalms 96'], // 277
  ['1 Chronicles 11', 'Micah 2', 'Matthew 18', 'Psalms 97'], // 278
  ['1 Chronicles 12', 'Micah 3', 'Matthew 19', 'Psalms 98'], // 279
  ['1 Chronicles 13', 'Micah 4', 'Matthew 20', 'Psalms 99'], // 280
  ['1 Chronicles 14', 'Micah 5', 'Matthew 21', 'Psalms 100'], // 281
  ['1 Chronicles 15', 'Micah 6', 'Matthew 22', 'Psalms 101'], // 282
  ['1 Chronicles 16', 'Micah 7', 'Matthew 23', 'Psalms 102'], // 283
  ['1 Chronicles 17', 'Nahum 1', 'Matthew 24', 'Psalms 103'], // 284
  ['1 Chronicles 18', 'Nahum 2', 'Matthew 25', 'Psalms 104'], // 285
  ['1 Chronicles 19', 'Nahum 3', 'Matthew 26', 'Psalms 105'], // 286
  ['1 Chronicles 20', 'Habakkuk 1', 'Matthew 27', 'Psalms 106'], // 287
  ['1 Chronicles 21', 'Habakkuk 2', 'Matthew 28', 'Psalms 107'], // 288
  ['1 Chronicles 22', 'Habakkuk 3', 'Mark 1', 'Psalms 108'], // 289
  ['1 Chronicles 23', 'Zephaniah 1', 'Mark 2', 'Psalms 109'], // 290
  ['1 Chronicles 24', 'Zephaniah 2', 'Mark 3', 'Psalms 110'], // 291
  ['1 Chronicles 25', 'Zephaniah 3', 'Mark 4', 'Psalms 111'], // 292
  ['1 Chronicles 26', 'Haggai 1', 'Mark 5', 'Psalms 112'], // 293
  ['1 Chronicles 27', 'Haggai 2', 'Mark 6', 'Psalms 113'], // 294
  ['1 Chronicles 28', 'Zechariah 1', 'Mark 7', 'Psalms 114'], // 295
  ['1 Chronicles 29', 'Zechariah 2', 'Mark 8', 'Psalms 115'], // 296
  ['2 Chronicles 1', 'Zechariah 3', 'Mark 9', 'Psalms 116'], // 297
  ['2 Chronicles 2', 'Zechariah 4', 'Mark 10', 'Psalms 117'], // 298
  ['2 Chronicles 3', 'Zechariah 5', 'Mark 11', 'Psalms 118'], // 299
  ['2 Chronicles 4', 'Zechariah 6', 'Mark 12', 'Psalms 119'], // 300
  ['2 Chronicles 5', 'Zechariah 7', 'Mark 13', 'Psalms 120'], // 301
  ['2 Chronicles 6', 'Zechariah 8', 'Mark 14', 'Psalms 121'], // 302
  ['2 Chronicles 7', 'Zechariah 9', 'Mark 15', 'Psalms 122'], // 303
  ['2 Chronicles 8', 'Zechariah 10', 'Mark 16', 'Psalms 123'], // 304
  ['2 Chronicles 9', 'Zechariah 11', 'Luke 1', 'Psalms 124'], // 305
  ['2 Chronicles 10', 'Zechariah 12', 'Luke 2', 'Psalms 125'], // 306
  ['2 Chronicles 11', 'Zechariah 13', 'Luke 3', 'Psalms 126'], // 307
  ['2 Chronicles 12', 'Zechariah 14', 'Luke 4', 'Psalms 127'], // 308
  ['2 Chronicles 13', 'Malachi 1', 'Luke 5', 'Psalms 128'], // 309
  ['2 Chronicles 14', 'Malachi 2', 'Luke 6', 'Psalms 129'], // 310
  ['2 Chronicles 15', 'Malachi 3', 'Luke 7', 'Psalms 130'], // 311
  ['2 Chronicles 16', 'Malachi 4', 'Luke 8', 'Psalms 131'], // 312
  ['2 Chronicles 17', 'Luke 9', 'Psalms 132'], // 313
  ['2 Chronicles 18', 'Luke 10', 'Psalms 133'], // 314
  ['2 Chronicles 19', 'Luke 11', 'Psalms 134'], // 315
  ['2 Chronicles 20', 'Luke 12', 'Psalms 135'], // 316
  ['2 Chronicles 21', 'Luke 13', 'Psalms 136'], // 317
  ['2 Chronicles 22', 'Luke 14', 'Psalms 137'], // 318
  ['2 Chronicles 23', 'Luke 15', 'Psalms 138'], // 319
  ['2 Chronicles 24', 'Luke 16', 'Psalms 139'], // 320
  ['2 Chronicles 25', 'Luke 17', 'Psalms 140'], // 321
  ['2 Chronicles 26', 'Luke 18', 'Psalms 141'], // 322
  ['2 Chronicles 27', 'Luke 19', 'Psalms 142'], // 323
  ['2 Chronicles 28', 'Luke 20', 'Psalms 143'], // 324
  ['2 Chronicles 29', 'Luke 21', 'Psalms 144'], // 325
  ['2 Chronicles 30', 'Luke 22', 'Psalms 145'], // 326
  ['2 Chronicles 31', 'Luke 23', 'Psalms 146'], // 327
  ['2 Chronicles 32', 'Luke 24', 'Psalms 147'], // 328
  ['2 Chronicles 33', 'John 1', 'Psalms 148'], // 329
  ['2 Chronicles 34', 'John 2', 'Psalms 149'], // 330
  ['2 Chronicles 35', 'John 3', 'Psalms 150'], // 331
  ['2 Chronicles 36', 'John 4', 'Proverbs 1'], // 332
  ['Ezra 1', 'John 5', 'Proverbs 2'], // 333
  ['Ezra 2', 'John 6', 'Proverbs 3'], // 334
  ['Ezra 3', 'John 7', 'Proverbs 4'], // 335
  ['Ezra 4', 'John 8', 'Proverbs 5'], // 336
  ['Ezra 5', 'John 9', 'Proverbs 6'], // 337
  ['Ezra 6', 'John 10', 'Proverbs 7'], // 338
  ['Ezra 7', 'John 11', 'Proverbs 8'], // 339
  ['Ezra 8', 'John 12', 'Proverbs 9'], // 340
  ['Ezra 9', 'John 13', 'Proverbs 10'], // 341
  ['Ezra 10', 'John 14', 'Proverbs 11'], // 342
  ['Nehemiah 1', 'John 15', 'Proverbs 12'], // 343
  ['Nehemiah 2', 'John 16', 'Proverbs 13'], // 344
  ['Nehemiah 3', 'John 17', 'Proverbs 14'], // 345
  ['Nehemiah 4', 'John 18', 'Proverbs 15'], // 346
  ['Nehemiah 5', 'John 19', 'Proverbs 16'], // 347
  ['Nehemiah 6', 'John 20', 'Proverbs 17'], // 348
  ['Nehemiah 7', 'John 21', 'Proverbs 18'], // 349
  ['Nehemiah 8', 'Romans 1', 'Proverbs 19'], // 350
  ['Nehemiah 9', 'Romans 2', 'Proverbs 20'], // 351
  ['Nehemiah 10', 'Romans 3', 'Proverbs 21'], // 352
  ['Nehemiah 11', 'Romans 4', 'Proverbs 22'], // 353
  ['Nehemiah 12', 'Romans 5', 'Proverbs 23'], // 354
  ['Nehemiah 13', 'Romans 6', 'Proverbs 24'], // 355
  ['Esther 1', 'Romans 7', 'Proverbs 25'], // 356
  ['Esther 2', 'Romans 8', 'Proverbs 26'], // 357
  ['Esther 3', 'Romans 9', 'Proverbs 27'], // 358
  ['Esther 4', 'Romans 10', 'Proverbs 28'], // 359
  ['Esther 5', 'Romans 11', 'Proverbs 29'], // 360
  ['Esther 6', 'Romans 12', 'Proverbs 30'], // 361
  ['Esther 7', 'Romans 13', 'Proverbs 31'], // 362
  ['Esther 8', 'Romans 14', 'Psalms 1'], // 363
  ['Esther 9', 'Romans 15', 'Psalms 2'], // 364
  ['Esther 10', 'Romans 16', 'Psalms 3'], // 365
];
