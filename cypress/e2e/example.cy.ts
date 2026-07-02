/// <reference types="cypress" />

describe('Example Test', () => {
  it('should visit a page', () => {
    cy.visit('https://example.cypress.io')
    cy.contains('type').click()
    cy.url().should('include', '/commands/actions')
  })
})
