import { defineStore } from 'pinia'
import http from '@/vue/utils/http'
import links from '@/vue/utils/links'
import { __ } from '@/vue/plugins/translations'

import SiteAnalysis from '@/vue/classes/SiteAnalysis'

import {
	useOptionsStore
} from '@/vue/stores'

const td = import.meta.env.VITE_TEXTDOMAIN

const filterResults = (results) => {
	// Drop all tests/results that do not have a matching title.
	// If a test has no title, it means it is deprecated/not supported by this version of the plugin.
	Object.keys(results).forEach(testName => {
		const testResult = results[testName]
		if (!SiteAnalysis.head(testName, testResult)) {
			const exceptions = [
				'searchPreview',
				'mobileSearchPreview',
				'mobileSnapshot'
			]

			if (!exceptions.includes(testName)) {
				delete results[testName]
			}
		}
	})

	return results
}

export const useAnalyzerStore = defineStore('AnalyzerStore', {
	state : () => ({
		analyzer     : null,
		analyzing    : false,
		analyzeError : null,
		homeResults  : {
			results : [],
			score   : 0
		},
		competitors : {}
	}),
	getters : {
		getHeadlineAnalysisResults : () => {
			const optionsStore = useOptionsStore()
			return optionsStore.internalOptions.internal.headlineAnalysis.headlines || {}
		},
		allItemsCount    : state => results => state.recommendedCount(results) + state.criticalCount(results) + state.goodCount(results),
		recommendedCount : state => results => {
			let total = 0
			results = results || state.homeResults?.results || {}

			Object.keys(results).forEach(group => {
				const groupResults = filterResults(results[group])
				Object.keys(groupResults).forEach(r => {
					const result = groupResults[r]
					if ('warning' === result.status) {
						total++
					}
				})
			})

			return total
		},
		criticalCount : state => results => {
			let total = 0
			results   = results || state.homeResults?.results || {}

			Object.keys(results).forEach(group => {
				const groupResults = filterResults(results[group])
				Object.keys(groupResults).forEach(r => {
					const result = groupResults[r]
					if ('error' === result.status) {
						total++
					}
				})
			})

			return total
		},
		goodCount : state => results => {
			let total = 0
			results   = results || state.homeResults?.results || {}

			Object.keys(results).forEach(group => {
				const groupResults = filterResults(results[group])
				Object.keys(groupResults).forEach(r => {
					const result = groupResults[r]
					if ('passed' === result.status) {
						total++
					}
				})
			})

			return total
		}
	},
	actions : {
		getSiteAnalysisResults () {
			if (this.homeResults?.results?.length) {
				return this.homeResults
			}

			this.analyzing = true

			return http.get(links.restUrl('seo-analysis/homeresults'))
				.then(response => {
					this.homeResults = response.body.result

					this.analyzing = false
					return this.homeResults
				})
		},
		getCompetitorSiteAnalysisResults () {
			if (this.competitors?.length) {
				return this.competitors
			}

			return http.get(links.restUrl('seo-analysis/competitors'))
				.then(response => {
					this.competitors = response.body.result

					return this.competitors
				})
		},
		runSiteAnalyzer (payload = {}) {
			this.analyzing = true
			this.analyzer  = 'competitor-site'

			return http.post(links.restUrl('analyze'))
				.send({
					url     : payload.url,
					refresh : payload.refresh
				})
				.then(response => {
					if (payload.url) {
						this.analyzing = false
						return response
					}

					this.homeResults = response.body
					this.analyzing = false
				})
				.catch(error => {
					this.analyzing = false
					let message = __('We couldn\'t connect to the site, please try again later.', td)
					if (error.response.body.response?.error) {
						message = error.response.body.response.error
					}

					this.analyzeError = message
				})
		},
		runHeadlineAnalyzer (payload = {}) {
			this.analyzer = 'headline'
			return http.post(links.restUrl('analyze-headline'))
				.send({
					headline            : payload.headline,
					shouldStoreHeadline : payload.shouldStoreHeadline
				})
				.then(response => {
					const optionsStore = useOptionsStore()
					optionsStore.updateOption('internalOptions', { groups: [ 'internal', 'headlineAnalysis' ], key: 'headlines', value: response.body })
					this.analyzing = false
				})
				.catch(error => {
					this.analyzing = false
					let message = __('We couldn\'t analyze your title, please try again later.', td)
					if (error.response.body?.message) {
						message = error.response.body.message
					}

					this.analyzeError = message
				})
		},
		deleteCompetitorSite (url) {
			return http.post(links.restUrl('analyze/delete-site'))
				.send({
					url
				})
				.then(() => {
					delete this.competitors[url]
					this.analyzing = false
				})
		},
		deleteHeadline (headline) {
			return http.post(links.restUrl('analyze-headline/delete'))
				.send({
					headline
				})
				.then(response => {
					const optionsStore = useOptionsStore()
					optionsStore.updateOption('internalOptions', { groups: [ 'internal', 'siteAnalysis' ], key: 'headlines', value: response.body })
					this.analyzing = false
				})
		}
	}
})