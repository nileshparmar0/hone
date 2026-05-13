insert into problems (slug, title, topic, difficulty, prompt, hints, solution, complexity) values
('two-sum', 'Two Sum', 'arrays', 'easy',
'Given an array of integers nums and an integer target, return the indices of the two numbers that add up to target. You may assume exactly one solution exists, and you may not use the same element twice.',
array[
  'What if you didnt need a nested loop?',
  'For each number x, what would its complement be?',
  'A hash map can turn a lookup from O(n) into O(1).'
],
'Iterate once. For each num at index i, check if (target - num) is already in a hash map. If yes, return [map[target-num], i]. Otherwise store {num: i}. Single pass, O(n) time, O(n) space.',
'O(n) time, O(n) space'),

('valid-parentheses', 'Valid Parentheses', 'stacks', 'easy',
'Given a string s containing only the characters ( ) { } [ ], determine if the input string is valid. A string is valid if open brackets are closed by the same type of brackets, in the correct order.',
array[
  'What data structure helps you match things in reverse order of arrival?',
  'When you see a closing bracket, what should the most recent open bracket be?',
  'If your stack isnt empty at the end, what does that mean?'
],
'Push every opening bracket onto a stack. For every closing bracket, pop and check the popped value matches the expected pair. If the stack is empty when you try to pop, or the pair doesnt match, return false. Return stack.length === 0 at the end.',
'O(n) time, O(n) space'),

('best-time-to-buy-stock', 'Best Time to Buy and Sell Stock', 'arrays', 'easy',
'You are given an array prices where prices[i] is the price of a given stock on day i. Find the maximum profit from a single buy and a later sell. If no profit is possible, return 0.',
array[
  'You need to buy before you sell. What does that tell you about how to scan the array?',
  'As you walk through the array, what is the cheapest price youve seen so far?',
  'At each day, compute the profit if you sold today against the min so far.'
],
'Track the minimum price seen so far. For each day, compute price - minSoFar and update maxProfit. Single pass.',
'O(n) time, O(1) space'),

('longest-substring-no-repeat', 'Longest Substring Without Repeating Characters', 'strings', 'medium',
'Given a string s, find the length of the longest substring without repeating characters.',
array[
  'A sliding window: when do you shrink it?',
  'Track the last index you saw each character at.',
  'When a duplicate appears inside your window, move the left pointer just past its previous index.'
],
'Two-pointer sliding window with a hash map of char to last-seen index. Move right pointer; if s[right] was seen and its index is >= left, move left to lastSeen + 1. Update lastSeen and track max window size.',
'O(n) time, O(min(n, alphabet)) space'),

('merge-intervals', 'Merge Intervals', 'arrays', 'medium',
'Given an array of intervals where intervals[i] = [start, end], merge all overlapping intervals and return an array of the non-overlapping intervals that cover all input intervals.',
array[
  'What if the intervals were sorted by start time?',
  'After sorting, when does the current interval overlap the previous one in the result?',
  'Either extend the last result interval, or push a new one.'
],
'Sort by start. Iterate; if the current intervals start is <= last result intervals end, set last.end = max(last.end, current.end). Otherwise push current onto result.',
'O(n log n) time, O(n) space'),

('binary-tree-level-order', 'Binary Tree Level Order Traversal', 'trees', 'medium',
'Given the root of a binary tree, return the level order traversal of its node values (each level as its own array).',
array[
  'Which traversal naturally visits nodes level by level?',
  'A queue. How do you know when one level ends?',
  'At the start of each iteration, snapshot the queue size; that is the level width.'
],
'BFS with a queue. At each iteration, capture queue.length as the level size; pop that many nodes into a level array, pushing their children. Append the level array to the result.',
'O(n) time, O(n) space'),

('lru-cache', 'LRU Cache', 'design', 'medium',
'Design a data structure that follows Least Recently Used eviction. get(key) and put(key, value) should both run in O(1) average time. Capacity is fixed at construction.',
array[
  'Two structures together can give O(1) for both operations.',
  'A hash map gives O(1) lookup. A doubly linked list gives O(1) reorder.',
  'On get and put, move the node to the head of the list. On overflow, evict the tail.'
],
'Combine a hash map (key -> node) with a doubly linked list. On get, lookup, move node to head, return value. On put, if key exists, update and move to head; if not, insert at head and evict tail if over capacity.',
'O(1) time per op, O(capacity) space'),

('course-schedule', 'Course Schedule', 'graphs', 'medium',
'There are numCourses courses labeled 0 to numCourses-1. Some courses have prerequisites given as pairs [a, b] meaning b must be taken before a. Return true if you can finish all courses.',
array[
  'This is really a question about a graph property.',
  'Specifically, whether the graph has a cycle.',
  'You can use Kahns algorithm (topological sort via in-degree queue) or DFS with three-state coloring.'
],
'Build adjacency list and in-degree array. Push all nodes with in-degree 0 onto a queue. Pop, decrement in-degree of neighbors, push any that hit 0. If processed count equals numCourses, no cycle exists. Return true.',
'O(V + E) time, O(V + E) space');