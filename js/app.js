class RiceGuide {
    constructor() {
        this.courses = [];
        this.currentCourse = null;
        this.currentLesson = null;
        this.currentLanguage = localStorage.getItem('riceGuideLanguage') || 'en';
        this.languages = [];
        this.progress = this.loadInitialProgress(); // Load progress first
        this.activeCategory = 'all';
        this.searchQuery = '';
        this.searchDebounceTimer = null;
        
        this.loadLanguages();
        this.bindEvents(); // Add this line to call bindEvents
        this.showLoading();
    }

    showLoading() {
        $('#loading-indicator').removeClass('hidden');
    }

    hideLoading() {
        $('#loading-indicator').addClass('hidden');
    }

    showError(message) {
        const errorDiv = $('#error-messages');
        errorDiv.html(`
            <div class="flex items-center">
                <svg class="h-5 w-5 text-red-400 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>${message}</span>
            </div>
        `).removeClass('hidden');
        setTimeout(() => errorDiv.addClass('hidden'), 5000);
    }

    loadLanguages() {
        this.showLoading();
        $.getJSON('data/languages.json')
            .done((data) => {
                this.languages = data.languages;
                this.renderLanguageSelector();
                this.loadCourses();
            })
            .fail((jqXHR, textStatus, error) => {
                this.showError('Failed to load languages. Please refresh the page.');
                console.error('Error loading languages:', error);
            })
            .always(() => this.hideLoading());
    }

    loadCourses() {
        this.courses = [];
        this.showLoading();
        $('#courses-list').html(`
            <div class="col-span-full text-center py-8">
                <div class="loading-spinner mx-auto"></div>
                <p class="mt-4 text-gray-600">Loading courses...</p>
            </div>
        `);

        $.getJSON(`data/courses_${this.currentLanguage}.json`)
            .then(data => {
                if (!data.courses || data.courses.length === 0) {
                    throw new Error('No courses available for this language');
                }
                const promises = data.courses.map(course => 
                    $.getJSON(`data/courses/${this.currentLanguage}/${course.id}.json`)
                        .catch(error => {
                            console.error(`Error loading course ${course.id}:`, error);
                            return null;
                        })
                );
                return Promise.all(promises);
            })
            .then(results => {
                this.courses = results.filter(course => course !== null);
                if (this.courses.length === 0) {
                    throw new Error('No courses could be loaded');
                }
                this.renderCategories(); // Add this line
                this.renderCourses();
                this.updateProgress(); // Update progress after courses load
                // Update all course cards
                this.courses.forEach(course => this.updateCourseProgress(course.id));
            })
            .catch(error => {
                console.error('Error loading courses:', error);
                $('#courses-list').html(`
                    <div class="col-span-full">
                        <div class="text-center py-8">
                            <div class="bg-red-50 border-l-4 border-red-500 p-4 rounded">
                                <p class="text-red-700">
                                    ${error.message || 'Error loading courses. Please try another language or refresh the page.'}
                                </p>
                            </div>
                        </div>
                    </div>
                `);
            })
            .finally(() => this.hideLoading());
    }

    bindEvents() {
        $('#back-button').on('click', () => this.showCourses());
        
        $(document).on('click', '[data-course-id]', (e) => {
            const courseId = $(e.currentTarget).data('course-id');
            this.showLessons(courseId);
        });

        $(document).on('click', '.lesson-item', (e) => {
            const courseId = $(e.currentTarget).data('course-id');
            const lessonId = $(e.currentTarget).data('lesson-id');
            this.showLesson(courseId, lessonId);
        });

        // Add search handler
        $('#course-search').on('input', (e) => {
            clearTimeout(this.searchDebounceTimer);
            this.searchDebounceTimer = setTimeout(() => {
                this.searchQuery = e.target.value.toLowerCase();
                this.filterCourses();
            }, 300);
        });

        // Add category filter handler
        $(document).on('click', '.category-filter', (e) => {
            const category = $(e.currentTarget).data('category');
            $('.category-filter').removeClass('active');
            $(e.currentTarget).addClass('active');
            this.activeCategory = category;
            this.filterCourses();
        });
    }

    renderLanguageSelector() {
        const navControls = $('.nav-controls');
        navControls.find('select').remove(); // Remove existing selector if any
        
        const selector = $('<select>').addClass('language-selector');
        this.languages.forEach(lang => {
            selector.append($('<option>')
                .val(lang.code)
                .text(lang.name)
                .prop('selected', lang.code === this.currentLanguage)
            );
        });
        
        selector.on('change', (e) => {
            this.currentLanguage = e.target.value;
            localStorage.setItem('riceGuideLanguage', this.currentLanguage);
            this.loadProgress(); // Load progress for new language
            this.loadCourses();
        });
        
        navControls.prepend(selector);
    }

    renderCategories() {
        const categories = ['all'];
        this.courses.forEach(course => {
            if (course.categories) {
                categories.push(...course.categories);
            }
        });
        
        const uniqueCategories = [...new Set(categories)];
        const filters = uniqueCategories.map(category => `
            <div class="category-filter ${category === 'all' ? 'active' : ''}" 
                 data-category="${category}">
                ${category.charAt(0).toUpperCase() + category.slice(1)}
            </div>
        `).join('');
        
        $('#category-filters').html(filters);
    }

    filterCourses() {
        const filteredCourses = this.courses.filter(course => 
            this.searchQuery === '' || 
            course.title.toLowerCase().includes(this.searchQuery) ||
            course.description.toLowerCase().includes(this.searchQuery)
        );
        this.renderFilteredCourses(filteredCourses);
    }

    renderCourseCard(course, highlight = false) {
        const completedLessons = this.getCompletedLessons(course.id);
        const totalLessons = course.lessons.length;
        const progressPercentage = (completedLessons / totalLessons) * 100;
        const title = highlight ? this.highlightSearch(course.title) : course.title;
        const description = highlight ? this.highlightSearch(course.description) : course.description;

        return `
            <div class="course-card bg-white p-6 rounded-xl border border-gray-100 hover:shadow-xl hover:border-green-100 transition-all duration-300 transform hover:-translate-y-1 flex flex-col cursor-pointer group" 
                 data-course-id="${course.id}">
                <div class="flex-grow">
                    <h2 class="text-xl font-bold mb-3 group-hover:text-green-600 transition-colors">${title}</h2>
                    <p class="text-gray-600 mb-6 line-clamp-2">${description}</p>
                    <div class="mt-auto pt-4 border-t border-gray-100">
                        <div class="flex justify-between items-center mb-2">
                            <span class="text-sm text-gray-600">
                                ${completedLessons}/${totalLessons} lessons
                            </span>
                            <span class="text-sm font-medium ${progressPercentage === 100 ? 'text-green-600' : 'text-gray-600'}">
                                ${Math.round(progressPercentage)}% Complete
                            </span>
                        </div>
                        <div class="overflow-hidden h-1.5 rounded-full bg-gray-100">
                            <div class="h-full bg-green-500 transition-all duration-500" 
                                 style="width: ${progressPercentage}%">
                            </div>
                        </div>
                    </div>
                </div>
                <div class="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-100">
                    ${(course.categories || []).map(cat => `
                        <span class="inline-flex px-3 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-100 hover:bg-green-100 transition-colors">
                            ${cat}
                        </span>
                    `).join('')}
                </div>
            </div>
        `;
    }

    renderFilteredCourses(courses) {
        const coursesList = $('#courses-list');
        coursesList.empty();

        // Update search results count
        if (courses.length === 0) {
            coursesList.html(`
                <div class="col-span-full text-center py-12">
                    <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p class="mt-4 text-gray-600">No courses found matching your search.</p>
                    <button onclick="app.resetSearch()" class="mt-4 text-green-600 hover:text-green-700">
                        Clear search
                    </button>
                </div>
            `);
            return;
        }

        courses.forEach(course => {
            coursesList.append(this.renderCourseCard(course, true));
        });
    }

    renderCourses() {
        const coursesList = $('#courses-list');
        coursesList.empty();

        if (this.courses.length === 0) {
            coursesList.html(`
                <div class="col-span-full text-center py-8">
                    <p class="text-gray-600">No courses available for this language yet.</p>
                </div>
            `);
            return;
        }

        this.courses.forEach(course => {
            coursesList.append(this.renderCourseCard(course));
        });
    }

    highlightSearch(text) {
        if (!this.searchQuery) return text;
        const regex = new RegExp(`(${this.searchQuery})`, 'gi');
        return text.replace(regex, '<mark class="bg-yellow-200">$1</mark>');
    }

    resetSearch() {
        this.searchQuery = '';
        this.activeCategory = 'all';
        $('#course-search').val('');
        $('.category-filter').removeClass('active');
        $('.category-filter[data-category="all"]').addClass('active');
        this.filterCourses();
    }

    showLessons(courseId) {
        this.currentCourse = this.courses.find(c => c.id === courseId);
        $('#courses-view').hide();
        $('#lesson-content').show();
        
        const lessonContainer = $('#lesson-container');
        lessonContainer.empty();
        
        lessonContainer.append(`
            <div class="bg-white rounded-xl p-8 shadow-sm border border-gray-100">
                <h1 class="text-3xl font-bold mb-2">${this.currentCourse.title}</h1>
                <div class="flex flex-wrap gap-2 mb-8">
                    ${(this.currentCourse.categories || []).map(cat => `
                        <span class="px-3 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-100">
                            ${cat}
                        </span>
                    `).join('')}
                </div>
                
                <div class="space-y-3">
                    ${this.currentCourse.lessons.map((lesson, index) => {
                        const isCompleted = this.isLessonCompleted(courseId, lesson.id);
                        return `
                            <div class="lesson-item group cursor-pointer p-4 rounded-lg border border-gray-100 hover:border-green-200 hover:shadow-sm transition-all duration-200
                                        ${isCompleted ? 'bg-green-50/50' : 'bg-white hover:bg-gray-50'}" 
                                data-course-id="${courseId}" 
                                data-lesson-id="${lesson.id}">
                                <div class="flex items-center justify-between">
                                    <div class="flex items-center gap-4">
                                        <span class="text-sm font-medium text-gray-500">Lesson ${index + 1}</span>
                                        <h3 class="font-semibold group-hover:text-green-600 transition-colors">
                                            ${lesson.title}
                                        </h3>
                                    </div>
                                    <span class="px-2 py-1 text-xs rounded-full ${isCompleted ? 
                                        'bg-green-100 text-green-700' : 
                                        'bg-gray-100 text-gray-600'}">
                                        ${isCompleted ? 'Completed' : 'Not Started'}
                                    </span>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `);
    }

    showLesson(courseId, lessonId) {
        const course = this.courses.find(c => c.id === courseId);
        const lesson = course.lessons.find(l => l.id === lessonId);
        const isCompleted = this.isLessonCompleted(courseId, lessonId);
        
        $('#lesson-container').html(`
            <h1 class="text-2xl font-bold mb-4">${lesson.title}</h1>
            <div class="lesson-content mb-6">
                ${lesson.content}
            </div>
            <div id="quiz-section" class="mb-6 hidden">
                <h3 class="text-xl font-bold mb-4">Quiz</h3>
                <div id="quiz-questions"></div>
                <div id="quiz-result" class="mt-4"></div>
            </div>
            <button class="complete-lesson px-4 py-2 ${isCompleted ? 'bg-red-500' : 'bg-green-500'} text-white rounded" 
                    onclick="app.toggleLessonCompletion('${courseId}', '${lessonId}')">
                ${isCompleted ? 'Mark as Incomplete' : 'Take Quiz to Complete'}
            </button>
        `);

        if (!isCompleted && lesson.quiz) {
            this.renderQuiz(lesson.quiz, courseId, lessonId);
        }
    }

    renderQuiz(quiz, courseId, lessonId) {
        $('#quiz-section').removeClass('hidden');
        const questionsHtml = quiz.questions.map((q, index) => `
            <div class="quiz-question mb-4">
                <p class="font-semibold mb-2">${index + 1}. ${q.question}</p>
                ${q.options.map((opt, i) => `
                    <label class="block mb-2">
                        <input type="radio" name="q${index}" value="${i}" class="mr-2">
                        ${opt}
                    </label>
                `).join('')}
            </div>
        `).join('');

        $('#quiz-questions').html(`
            ${questionsHtml}
            <button onclick="app.checkQuiz('${courseId}', '${lessonId}')" 
                    class="px-4 py-2 bg-blue-500 text-white rounded">
                Submit Quiz
            </button>
        `);
    }

    checkQuiz(courseId, lessonId) {
        const course = this.courses.find(c => c.id === courseId);
        const lesson = course.lessons.find(l => l.id === lessonId);
        const quiz = lesson.quiz;
        
        let correct = 0;
        quiz.questions.forEach((q, index) => {
            const selected = $(`input[name="q${index}"]:checked`).val();
            if (selected === q.correct.toString()) correct++;
        });

        const percentage = (correct / quiz.questions.length) * 100;
        
        if (percentage >= 70) {
            $('#quiz-result').html(`
                <div class="text-green-600">Congratulations! You scored ${percentage}%. Click 'Mark as Complete' to proceed.</div>
            `);
            $('.complete-lesson')
                .text('Mark as Complete')
                .attr('onclick', `app.completeLesson('${courseId}', '${lessonId}')`);
        } else {
            $('#quiz-result').html(`
                <div class="text-red-600">You scored ${percentage}%. You need 70% to complete this lesson. Please try again.</div>
            `);
        }
    }

    completeLesson(courseId, lessonId) {
        if (!this.progress[courseId]) {
            this.progress[courseId] = [];
        }
        if (!this.progress[courseId].includes(lessonId)) {
            this.progress[courseId].push(lessonId);
            this.saveProgress();
            this.updateProgress();
            
            // Update the lesson list view
            $(`.lesson-item[data-lesson-id="${lessonId}"]`).addClass('border-l-4 border-green-500');
            
            // Update the course card if visible
            this.updateCourseProgress(courseId);
        }
        this.showLessons(courseId);
    }

    toggleLessonCompletion(courseId, lessonId) {
        if (this.isLessonCompleted(courseId, lessonId)) {
            if (!this.progress[courseId]) {
                this.progress[courseId] = [];
            }
            this.progress[courseId] = this.progress[courseId].filter(id => id !== lessonId);
            this.saveProgress();
            this.updateProgress();
            
            // Update the lesson list view
            $(`.lesson-item[data-lesson-id="${lessonId}"]`).removeClass('border-l-4 border-green-500');
            
            // Update the course card if visible
            this.updateCourseProgress(courseId);
            this.showLessons(courseId);
        }
    }

    updateCourseProgress(courseId) {
        const course = this.courses.find(c => c.id === courseId);
        if (!course) return;

        const completedLessons = this.getCompletedLessons(courseId);
        const totalLessons = course.lessons.length;
        const progressPercentage = (completedLessons / totalLessons) * 100;

        const courseCard = $(`.course-card[data-course-id="${courseId}"]`);
        if (courseCard.length) {
            courseCard.find('.text-sm.text-gray-500').first().text(`${completedLessons}/${totalLessons} lessons completed`);
            courseCard.find('.text-sm.text-gray-500').last().text(`${Math.round(progressPercentage)}%`);
            courseCard.find('.bg-green-500').css('width', `${progressPercentage}%`);
        }
    }

    updateProgress() {
        if (!this.courses || this.courses.length === 0) {
            const totalCompleted = Object.values(this.progress).reduce((sum, lessons) => sum + lessons.length, 0);
            if (totalCompleted > 0) {
                $('#progress-status').html(`
                    <div class="circle"></div>
                    <span>${totalCompleted} lessons done</span>
                `);
            }
            return;
        }

        const totalLessons = this.courses.reduce((sum, course) => sum + course.lessons.length, 0);
        const completedLessons = Object.values(this.progress).reduce((sum, lessons) => sum + lessons.length, 0);
        const totalPercentage = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
        
        if (totalLessons > 0) {
            $('#progress-status').html(`
                <div class="circle"></div>
                <span>${completedLessons}/${totalLessons} • ${totalPercentage}%</span>
            `);
        }
    }

    isLessonCompleted(courseId, lessonId) {
        return this.progress[courseId]?.includes(lessonId) || false;
    }

    getCompletedLessons(courseId) {
        return this.progress[courseId]?.length || 0;
    }

    showCourses() {
        $('#lesson-content').hide();
        $('#courses-view').show();
    }

    loadInitialProgress() {
        const allProgress = JSON.parse(localStorage.getItem('riceGuideProgress')) || {};
        const currentProgress = allProgress[this.currentLanguage] || {};
        
        const progressData = Object.values(currentProgress).reduce((sum, lessons) => sum + lessons.length, 0);
        if (progressData > 0) {
            $('#progress-status').html(`
                <div class="circle"></div>
                <span>Loading progress...</span>
            `);
        }
        
        return currentProgress;
    }

    loadProgress() {
        const allProgress = JSON.parse(localStorage.getItem('riceGuideProgress')) || {};
        this.progress = allProgress[this.currentLanguage] || {};
    }

    saveProgress() {
        const allProgress = JSON.parse(localStorage.getItem('riceGuideProgress')) || {};
        allProgress[this.currentLanguage] = this.progress;
        localStorage.setItem('riceGuideProgress', JSON.stringify(allProgress));
    }
}

// Add window error handler
window.onerror = function(msg, url, lineNo, columnNo, error) {
    const errorMessage = `An error occurred: ${msg}`;
    if (window.app) {
        window.app.showError(errorMessage);
    }
    return false;
};

const app = new RiceGuide();
